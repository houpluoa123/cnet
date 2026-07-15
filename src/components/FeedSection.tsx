/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, MessageSquareHeart, Heart, Send, Users, Activity, ShieldAlert, MessageSquare, Share2, Trash2 } from 'lucide-react';
import { FeedPost, User, Comment } from '../types';

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

  // Comment sub-states
  const [loadedComments, setLoadedComments] = useState<{ [postId: number]: Comment[] }>({});
  const [expandedComments, setExpandedComments] = useState<{ [postId: number]: boolean }>({});
  const [commentInputs, setCommentInputs] = useState<{ [postId: number]: string }>({});

  const fetchTimeline = async () => {
    try {
      setIsLoading(true);
      setErrorMsg('');
      const res = await fetch('/api/feeds/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Không thể tải vòng thời gian ZNet');
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
    
    // Fetch comments on demand if not fetched or force refresh
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
