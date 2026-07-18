/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, MessageSquareHeart, Heart, Send, Users, Activity, ShieldAlert, MessageSquare, Share2, Trash2 } from 'lucide-react';
import { FeedPost, User, Comment } from '../types';
import { syncFeedPostToFirebase } from '../lib/firebase';
import { apiFetch as fetch } from '../lib/api';
import { supabase } from '../supabaseClient';

interface FeedSectionProps {
  token: string;
  user: User;
  onViewProfile?: (userId: number) => void;
}

export default function FeedSection({ token, user, onViewProfile }: FeedSectionProps) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmiting, setIsSubmiting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [sharedPostId, setSharedPostId] = useState<number | null>(null);

  // Supabase states
  const [supabaseMode, setSupabaseMode] = useState<boolean>(false);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);

  // Comment sub-states
  const [loadedComments, setLoadedComments] = useState<{ [postId: number]: Comment[] }>({});
  const [expandedComments, setExpandedComments] = useState<{ [postId: number]: boolean }>({});
  const [commentInputs, setCommentInputs] = useState<{ [postId: number]: string }>({});

  const fetchTimeline = async () => {
    try {
      setIsLoading(true);
      setErrorMsg('');

      // 1. Try querying Supabase
      const { data: sbUserRes } = await supabase.auth.getUser();
      const currentSbUserId = sbUserRes?.user?.id;

      const { data: sbPosts, error: sbError } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (sbError) {
        if (sbError.code === '42P01') {
          console.warn("Supabase 'posts' table not found. Falling back to local SQLite database.");
          setSupabaseError('posts_table_missing');
          setSupabaseMode(false);
        } else {
          throw sbError;
        }
      } else if (sbPosts) {
        setSupabaseMode(true);
        setSupabaseError(null);

        // Fetch user's likes to determine hasLiked status
        let likedPostIds = new Set<string>();
        if (currentSbUserId) {
          const { data: likes } = await supabase
            .from('post_likes')
            .select('post_id')
            .eq('user_id', currentSbUserId);
          
          if (likes) {
            likedPostIds = new Set(likes.map((l: any) => String(l.post_id)));
          }
        }

        // Fetch comment counts
        const { data: commentCounts } = await supabase
          .from('comments')
          .select('post_id');
        
        const countsMap: { [key: string]: number } = {};
        if (commentCounts) {
          commentCounts.forEach((c: any) => {
            countsMap[c.post_id] = (countsMap[c.post_id] || 0) + 1;
          });
        }

        // Map Supabase rows to FeedPost interface
        const mappedPosts: FeedPost[] = sbPosts.map((p: any) => ({
          id: p.id,
          content: p.content,
          likesCount: p.likes_count || 0,
          createdAt: p.created_at,
          username: p.username,
          avatar: p.avatar,
          userId: p.user_id === currentSbUserId ? user.id : -1,
          hasLiked: likedPostIds.has(String(p.id)) ? 1 : 0,
          commentsCount: countsMap[p.id] || 0
        }));

        setPosts(mappedPosts);
        setIsLoading(false);
        return;
      }
    } catch (e: any) {
      console.warn("Supabase load failed, utilizing SQLite fallback:", e);
    }

    // 2. Local SQLite fallback
    try {
      setSupabaseMode(false);
      const res = await fetch('/api/feeds/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Không thể tải vòng thời gian ZNet từ SQLite');
      const data = await res.json();
      setPosts(data || []);
    } catch (e: any) {
      console.error("Get feed list error:", e);
      setErrorMsg(e.message || 'Lỗi liên kết máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  const publishStatusPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    try {
      setIsSubmiting(true);
      setErrorMsg('');

      if (supabaseMode) {
        const { data: sbUserRes } = await supabase.auth.getUser();
        const currentSbUser = sbUserRes?.user;
        if (!currentSbUser) {
          throw new Error('Bạn cần đăng nhập Supabase trước khi tạo bài đăng.');
        }

        const { data: newPost, error: sbInsertError } = await supabase
          .from('posts')
          .insert({
            user_id: currentSbUser.id,
            username: user.username,
            avatar: user.avatar,
            content: inputText.trim(),
            likes_count: 0
          })
          .select()
          .single();

        if (sbInsertError) throw sbInsertError;

        if (newPost) {
          const mappedPost: FeedPost = {
            id: newPost.id,
            content: newPost.content,
            likesCount: 0,
            createdAt: newPost.created_at,
            username: newPost.username,
            avatar: newPost.avatar,
            userId: user.id,
            hasLiked: 0,
            commentsCount: 0
          };

          setPosts(prev => [mappedPost, ...prev]);
          setInputText('');
          setIsSubmiting(false);
          return;
        }
      }
    } catch (err: any) {
      console.error("Supabase publish error:", err);
      setErrorMsg(err.message || 'Đăng trạng thái lên Supabase thất bại.');
      setIsSubmiting(false);
      return;
    }

    // SQLite Fallback
    try {
      const res = await fetch('/api/feeds/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: inputText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trích xuất bài đăng thất bại');

      // Append locally to head of list
      setPosts(prev => [data, ...prev]);
      setInputText('');

      // Background real-time Firebase sync
      try {
        syncFeedPostToFirebase(data);
      } catch (fbErr) {
        console.warn("Real-time Firebase sync failed for feed post:", fbErr);
      }
    } catch (err: any) {
      console.error("Publish feed error:", err);
      setErrorMsg(err.message || 'Đăng trạng thái thất bại.');
    } finally {
      setIsSubmiting(false);
    }
  };

  const deleteStatusPost = async (postId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bài đăng cá nhân này không? Tất cả lượt Lượt thích & Bình luận sẽ bị loại bỏ.')) {
      return;
    }

    if (supabaseMode) {
      try {
        const { error: sbDeleteError } = await supabase
          .from('posts')
          .delete()
          .eq('id', postId);

        if (sbDeleteError) throw sbDeleteError;

        setPosts(prev => prev.filter(p => p.id !== postId));
        alert('Đã xóa bài viết khỏi Supabase thành công.');
        return;
      } catch (err: any) {
        console.error("Supabase delete failed:", err);
        alert(err.message || 'Không thể xóa bài đăng trên Supabase.');
        return;
      }
    }

    // SQLite Fallback
    try {
      const res = await fetch(`/api/feeds/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== postId));
        alert('Đã xóa bài viết khỏi ZNet thành công.');
      } else {
        const data = await res.json();
        alert(data.error || 'Không thể xóa bài đăng.');
      }
    } catch (err) {
      console.error("Delete status post error:", err);
    }
  };

  const likeStatusPost = async (postId: number) => {
    if (supabaseMode) {
      try {
        const { data: sbUserRes } = await supabase.auth.getUser();
        const currentSbUserId = sbUserRes?.user?.id;
        if (!currentSbUserId) return;

        const post = posts.find(p => p.id === postId);
        const hasLiked = post ? !!post.hasLiked : false;

        if (hasLiked) {
          const { error: deleteLikeErr } = await supabase
            .from('post_likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', currentSbUserId);

          if (deleteLikeErr) throw deleteLikeErr;

          const newLikesCount = Math.max(0, (post?.likesCount || 1) - 1);
          await supabase
            .from('posts')
            .update({ likes_count: newLikesCount })
            .eq('id', postId);

          setPosts(prev =>
            prev.map(p => p.id === postId ? { ...p, likesCount: newLikesCount, hasLiked: 0 } : p)
          );
        } else {
          const { error: insertLikeErr } = await supabase
            .from('post_likes')
            .insert({ post_id: postId, user_id: currentSbUserId });

          if (insertLikeErr) throw insertLikeErr;

          const newLikesCount = (post?.likesCount || 0) + 1;
          await supabase
            .from('posts')
            .update({ likes_count: newLikesCount })
            .eq('id', postId);

          setPosts(prev =>
            prev.map(p => p.id === postId ? { ...p, likesCount: newLikesCount, hasLiked: 1 } : p)
          );
        }
        return;
      } catch (err) {
        console.error("Supabase like failed:", err);
        return;
      }
    }

    // SQLite Fallback
    try {
      const res = await fetch(`/api/feeds/like/${postId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setPosts(prev =>
          prev.map(post => {
            if (post.id === postId) {
              return { ...post, likesCount: data.likesCount, hasLiked: data.hasLiked };
            }
            return post;
          })
        );
      }
    } catch (e) {
      console.error("Like post error:", e);
    }
  };

  const toggleComments = async (postId: number) => {
    if (expandedComments[postId]) {
      setExpandedComments(prev => ({ ...prev, [postId]: false }));
      return;
    }

    setExpandedComments(prev => ({ ...prev, [postId]: true }));

    if (supabaseMode) {
      try {
        const { data: sbComments, error: sbCommentsErr } = await supabase
          .from('comments')
          .select('*')
          .eq('post_id', postId)
          .order('created_at', { ascending: true });

        if (sbCommentsErr) throw sbCommentsErr;

        const mappedComments: Comment[] = (sbComments || []).map((c: any) => ({
          id: c.id,
          content: c.content,
          createdAt: c.created_at,
          userId: c.user_id === user.id ? user.id : -1,
          username: c.username,
          avatar: c.avatar
        }));

        setLoadedComments(prev => ({ ...prev, [postId]: mappedComments }));
        return;
      } catch (err) {
        console.error("Supabase get comments error:", err);
        return;
      }
    }

    // SQLite Fallback
    try {
      const res = await fetch(`/api/feeds/comments/${postId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const commentsList = await res.json();
        setLoadedComments(prev => ({ ...prev, [postId]: commentsList }));
      }
    } catch (err) {
      console.error("Load comments error:", err);
    }
  };

  const submitComment = async (postId: number, e: React.FormEvent) => {
    e.preventDefault();
    const commentText = commentInputs[postId]?.trim();
    if (!commentText) return;

    if (supabaseMode) {
      try {
        const { data: sbUserRes } = await supabase.auth.getUser();
        const currentSbUser = sbUserRes?.user;
        if (!currentSbUser) return;

        const { data: newComment, error: commentErr } = await supabase
          .from('comments')
          .insert({
            post_id: postId,
            user_id: currentSbUser.id,
            username: user.username,
            avatar: user.avatar,
            content: commentText
          })
          .select()
          .single();

        if (commentErr) throw commentErr;

        if (newComment) {
          const mappedComment: Comment = {
            id: newComment.id,
            content: newComment.content,
            createdAt: newComment.created_at,
            userId: user.id,
            username: newComment.username,
            avatar: newComment.avatar
          };

          setLoadedComments(prev => ({
            ...prev,
            [postId]: [...(prev[postId] || []), mappedComment]
          }));
          setCommentInputs(prev => ({ ...prev, [postId]: '' }));
          
          setPosts(prev =>
            prev.map(post => {
              if (post.id === postId) {
                return { ...post, commentsCount: (post.commentsCount || 0) + 1 };
              }
              return post;
            })
          );
        }
        return;
      } catch (err) {
        console.error("Supabase comment submit failing:", err);
        return;
      }
    }

    // SQLite Fallback
    try {
      const res = await fetch(`/api/feeds/comments/${postId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: commentText })
      });
      if (res.ok) {
        const commentObj = await res.json();
        setLoadedComments(prev => ({
          ...prev,
          [postId]: [...(prev[postId] || []), commentObj]
        }));
        setCommentInputs(prev => ({ ...prev, [postId]: '' }));
        setPosts(prev =>
          prev.map(post => {
            if (post.id === postId) {
              return { ...post, commentsCount: (post.commentsCount || 0) + 1 };
            }
            return post;
          })
        );
      }
    } catch (err) {
      console.error("Submit comment post failed:", err);
    }
  };

  const handleCopyShareLink = (postId: number) => {
    try {
      const link = `${window.location.origin}/post/${postId}`;
      navigator.clipboard.writeText(link);
      setSharedPostId(postId);
      setTimeout(() => setSharedPostId(null), 3000);
    } catch (err) {
      console.error('Copy share failed:', err);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col h-full overflow-y-auto" id="feed_outer_section">
      {/* Upper header summary */}
      <div className="flex items-center justify-between border-b border-slate-800/85 pb-5 mb-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/15">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold font-sans text-white">Vòng Thời Gian</h3>
            <p className="text-[10px] text-slate-400">Chia sẻ mọi hoạt động hằng ngày của bạn tới cộng đồng ZNet</p>
          </div>
        </div>

        <button
          onClick={fetchTimeline}
          disabled={isLoading}
          className="text-[10px] font-semibold bg-slate-950 hover:bg-slate-910 border border-slate-850 rounded-xl px-3 py-2 text-slate-400 hover:text-white cursor-pointer transition"
        >
          {isLoading ? 'Đang tải...' : 'Làm mới feed'}
        </button>
      </div>

      {supabaseError === 'posts_table_missing' && (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-2xl text-xs space-y-2 shrink-0">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-white mb-0.5">⚠️ Chế độ ngoại tuyến SQLite đang chạy (Local Offline Mode)</span>
              <span>Ứng dụng ZNet đã kết nối với Supabase, nhưng bảng <strong>posts</strong> chưa được tạo trên cơ sở dữ liệu của bạn. Hãy khởi tạo các bảng Supabase bằng cách sao chép và thực thi tệp lệnh SQL trong bảng điều khiển Supabase SQL Editor của bạn!</span>
            </div>
          </div>
          <details className="mt-2 text-[10px] font-mono bg-slate-950 p-3 rounded-xl border border-slate-800">
            <summary className="cursor-pointer text-amber-400 font-bold hover:underline select-none">Nhấp vào đây để xem mã nguồn SQL tạo bảng</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre leading-relaxed select-all">
{`-- Tạo bảng posts trong Supabase
create table public.posts (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  username text not null,
  avatar text not null,
  content text not null,
  likes_count int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Kích hoạt Row Level Security (RLS)
alter table public.posts enable row level security;

-- Tạo chính sách bảo mật cho bảng posts
create policy "Anyone can read posts" on public.posts for select using (true);
create policy "Users can insert their own posts" on public.posts for insert with check (auth.uid() = user_id);
create policy "Users can update their own posts" on public.posts for update using (auth.uid() = user_id);
create policy "Users can delete their own posts" on public.posts for delete using (auth.uid() = user_id);

-- Tạo bảng comments
create table public.comments (
  id bigint generated always as identity primary key,
  post_id bigint references public.posts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  username text not null,
  avatar text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.comments enable row level security;
create policy "Anyone can view comments" on public.comments for select using (true);
create policy "Users can insert comments" on public.comments for insert with check (auth.uid() = user_id);
create policy "Users can delete their own comments" on public.comments for delete using (auth.uid() = user_id);

-- Tạo bảng likes
create table public.post_likes (
  post_id bigint references public.posts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;
create policy "Anyone can view likes" on public.post_likes for select using (true);
create policy "Users can toggle likes" on public.post_likes for insert with check (auth.uid() = user_id);
create policy "Users can delete their own likes" on public.post_likes for delete using (auth.uid() = user_id);`}
            </pre>
          </details>
        </div>
      )}

      {supabaseMode && (
        <div className="mb-4 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-[10px] uppercase font-bold tracking-wider inline-flex items-center gap-1.5 self-start shrink-0 animate-fade-in">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Đã đồng bộ hóa Trực tiếp với Supabase Cloud
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 text-xs rounded-xl flex items-center gap-2 mb-4 shrink-0">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Editor block to publish updates */}
      <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 mb-6 shrink-0" id="feed_creator_block">
        <div className="flex items-start gap-3">
          <img referrerPolicy="no-referrer" src={user.avatar} alt="Avatar self" className="w-9 h-9 rounded-xl object-cover shrink-0" />
          <form onSubmit={publishStatusPost} className="flex-1 space-y-3">
            <textarea
              rows={3}
              maxLength={1500}
              placeholder="Hôm nay bạn thế nào? Hãy chia sẻ cho cộng đồng ZNet ngay..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full text-xs text-white bg-transparent border-none placeholder-slate-550 focus:outline-none resize-none"
              id="feed_input_textarea"
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-850/80">
              <span className="text-[9px] text-slate-500">Giới hạn 1500 ký tự</span>
              <button
                type="submit"
                disabled={isSubmiting || !inputText.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl py-2 px-4 text-xs font-semibold hover:scale-103 transition cursor-pointer flex items-center gap-1.5 shadow-md animate-fade-in"
              >
                {isSubmiting ? 'Vui lòng chờ...' : <><Send className="w-3 h-3" /> Đăng Trạng Thái</>}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Posts collection timeline */}
      <div className="flex-1 space-y-5" id="feed_list_container">
        {posts.length === 0 ? (
          <div className="text-center py-12 bg-slate-950/20 border border-slate-850 rounded-2xl p-6">
            <MessageSquareHeart className="w-10 h-10 text-indigo-400/40 mx-auto mb-2" />
            <h4 className="text-white text-xs font-bold">Chưa có bài đăng nào mới</h4>
            <p className="text-[10px] text-slate-550 mt-1">Trở thành người đầu tiên chia sẻ trạng thái của bạn trên ZNet!</p>
          </div>
        ) : (
          posts.map((post) => {
            const isMe = post.userId === user.id;
            const postDate = new Date(post.createdAt);
            const relativeTimeStr = postDate.toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            const hasLiked = !!post.hasLiked;
            const isExpanded = !!expandedComments[post.id];
            const comments = loadedComments[post.id] || [];

            return (
              <div
                key={post.id}
                className="bg-slate-950/20 border border-slate-850 rounded-2xl p-5 hover:border-slate-800 transition shadow-sm animate-fade-in"
                id={`feed_post_card_${post.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <img
                      referrerPolicy="no-referrer"
                      src={post.avatar}
                      alt="Avatar profile"
                      onClick={() => onViewProfile && onViewProfile(post.userId)}
                      className="w-10 h-10 rounded-xl object-cover shrink-0 cursor-pointer hover:opacity-85 border border-slate-800"
                    />
                    <div>
                      <h4
                        onClick={() => onViewProfile && onViewProfile(post.userId)}
                        className="text-xs font-bold text-white flex items-center gap-1.5 leading-none cursor-pointer hover:text-indigo-400"
                      >
                        {post.username}
                        {isMe && (
                          <span className="text-[8px] tracking-wider uppercase font-extrabold px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 rounded-md scale-90">TÔI</span>
                        )}
                      </h4>
                      <span className="text-[9px] text-slate-500 block mt-1">{relativeTimeStr}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {/* Delete post option only for author */}
                    {isMe && (
                      <button
                        onClick={() => deleteStatusPost(post.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-950 flex items-center justify-center transition"
                        title="Xóa bài viết này khỏi dòng thời gian"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-500">
                      <Users className="w-3 h-3" /> Công khai
                    </span>
                  </div>
                </div>

                <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap ml-1 pl-1 border-l-2 border-indigo-500/10 mb-4 font-normal mt-2.5">
                  {post.content}
                </p>

                {/* Bottom interactive links */}
                <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-850/60 shrink-0">
                  <button
                    onClick={() => likeStatusPost(post.id)}
                    className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors cursor-pointer group ${
                      hasLiked ? 'text-rose-400' : 'text-slate-400 hover:text-rose-455'
                    }`}
                  >
                    <span className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                      hasLiked ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-900/50 group-hover:bg-rose-500/10 text-slate-400'
                    }`}>
                      <Heart className={`w-3.5 h-3.5 ${hasLiked ? 'fill-rose-500' : 'fill-rose-500/0'}`} />
                    </span>
                    <span>{hasLiked ? 'Đã Thích' : 'Thích'} ({post.likesCount})</span>
                  </button>

                  <button
                    onClick={() => toggleComments(post.id)}
                    className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors cursor-pointer group ${
                      isExpanded ? 'text-indigo-400' : 'text-slate-400 hover:text-indigo-455'
                    }`}
                  >
                    <span className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                      isExpanded ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-900/50 group-hover:bg-indigo-500/10 text-slate-400'
                    }`}>
                      <MessageSquare className="w-3.5 h-3.5" />
                    </span>
                    <span>Bình luận ({post.commentsCount || 0})</span>
                  </button>

                  {/* Share status post control button */}
                  <button
                    onClick={() => handleCopyShareLink(post.id)}
                    className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors cursor-pointer group ${
                      sharedPostId === post.id ? 'text-emerald-400' : 'text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    <span className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                      sharedPostId === post.id ? 'bg-emerald-505 bg-emerald-500/10 text-emerald-400' : 'bg-slate-900/50 group-hover:bg-emerald-500/10 text-slate-400'
                    }`}>
                      <Share2 className="w-3.5 h-3.5" />
                    </span>
                    <span>{sharedPostId === post.id ? 'Đã sao chép link!' : 'Chia sẻ công khai'}</span>
                  </button>
                </div>

                {/* Collapsible Comments Section */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-850/45 space-y-4 animate-fade-in">
                    {/* Comments list */}
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                      {comments.length === 0 ? (
                        <p className="text-[10px] text-slate-500 italic pl-2.5">Chưa có bình luận nào. Hãy gửi bình luận đầu tiên của bạn!</p>
                      ) : (
                        comments.map((comm) => (
                          <div key={comm.id} className="flex gap-2.5 items-start bg-slate-950/20 p-2.5 rounded-xl border border-slate-850/50 animate-fade-in">
                            <img
                              referrerPolicy="no-referrer"
                              src={comm.avatar}
                              alt={comm.username}
                              onClick={() => onViewProfile && onViewProfile(comm.userId)}
                              className="w-7 h-7 rounded-lg object-cover cursor-pointer hover:ring-1 hover:ring-indigo-500 shrink-0 border border-slate-850"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span
                                  onClick={() => onViewProfile && onViewProfile(comm.userId)}
                                  className="text-[11px] font-bold text-slate-200 cursor-pointer hover:text-indigo-400"
                                >
                                  {comm.username}
                                </span>
                                <span className="text-[8px] text-slate-550">
                                  {new Date(comm.createdAt).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-slate-300 text-xs font-normal leading-relaxed break-words">{comm.content}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Quick comment compose input */}
                    <form onSubmit={(e) => submitComment(post.id, e)} className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Viết câu trả lời của bạn..."
                        value={commentInputs[post.id] || ''}
                        onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                        className="flex-1 bg-slate-950/60 border border-slate-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="submit"
                        disabled={!commentInputs[post.id]?.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white p-2 rounded-xl transition cursor-pointer flex items-center justify-center shadow-sm"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
