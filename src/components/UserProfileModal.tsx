/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, UserPlus, UserMinus, UserCheck, Shield, MessageSquare, Plus, Loader2, Sparkles, Send } from 'lucide-react';
import { FeedPost, Friend, ChatGroup } from '../types';

interface UserProfileModalProps {
  token: string;
  userId: number;
  currentUserId: number;
  onClose: () => void;
  onStartChat?: (friend: Friend) => void;
}

interface OtherUserProfile {
  id: number;
  username: string;
  avatar: string;
  status: string;
  role?: string;
  relationshipStatus: 'accepted' | 'pending' | 'none';
  requestInitiator?: number | null;
  recentFeeds: FeedPost[];
}

export default function UserProfileModal({ token, userId, currentUserId, onClose, onStartChat }: UserProfileModalProps) {
  const [profile, setProfile] = useState<OtherUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isProcessingFriendship, setIsProcessingFriendship] = useState<boolean>(false);
  const [myGroups, setMyGroups] = useState<ChatGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [inviteMsg, setInviteMsg] = useState<string>('');
  const [inviteError, setInviteError] = useState<string>('');
  const [isInviting, setIsInviting] = useState<boolean>(false);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      setErrorMsg('');
      const res = await fetch(`/api/users/profile/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Không thể tải hồ sơ người dùng này.');
      }
      const data = await res.json();
      setProfile({
        id: data.id,
        username: data.username,
        avatar: data.avatar,
        status: data.status,
        role: data.role,
        relationshipStatus: data.relationshipStatus,
        requestInitiator: data.requestInitiator,
        recentFeeds: data.recentFeeds || []
      });
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Lỗi liên kết máy chủ.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMyGroups = async () => {
    try {
      const res = await fetch('/api/groups/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyGroups(data || []);
      }
    } catch (error) {
      console.error('Cannot load my groups:', error);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchMyGroups();
  }, [userId]);

  const handleAddFriend = async () => {
    if (!profile) return;
    try {
      setIsProcessingFriendship(true);
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ friendId: profile.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gửi yêu cầu thất bại');
      
      setProfile(prev => prev ? {
        ...prev,
        relationshipStatus: 'pending',
        requestInitiator: currentUserId
      } : null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessingFriendship(false);
    }
  };

  const handleAcceptFriend = async () => {
    if (!profile) return;
    try {
      setIsProcessingFriendship(true);
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ requestId: profile.id, action: 'accept' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chấp nhận lời mời thất bại');

      setProfile(prev => prev ? {
        ...prev,
        relationshipStatus: 'accepted'
      } : null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessingFriendship(false);
    }
  };

  const handleUnfriend = async () => {
    if (!profile) return;
    const confirmLabel = profile.relationshipStatus === 'accepted' 
      ? 'Bạn có thực sự muốn hủy kết bạn với người dùng này?'
      : 'Bạn có thực sự muốn hủy yêu cầu kết bạn này?';
    
    if (!window.confirm(confirmLabel)) return;

    try {
      setIsProcessingFriendship(true);
      const res = await fetch('/api/friends/unfriend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ friendId: profile.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hủy bỏ kết bạn thất bại');

      setProfile(prev => prev ? {
        ...prev,
        relationshipStatus: 'none',
        requestInitiator: null
      } : null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessingFriendship(false);
    }
  };

  const handleInviteToGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !profile) return;
    setInviteMsg('');
    setInviteError('');
    setIsInviting(true);

    try {
      const res = await fetch('/api/groups/add-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          groupId: parseInt(selectedGroupId), 
          memberId: profile.id 
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể thêm thành viên vào nhóm');
      }
      setInviteMsg('Đã thêm thành viên vào nhóm trò chuyện thành công!');
      setSelectedGroupId('');
      setTimeout(() => setInviteMsg(''), 4000);
    } catch (err: any) {
      setInviteError(err.message || 'Lỗi thêm tài khoản vào nhóm');
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" id="user_profile_modal_overlay">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
        id="user_profile_modal_box"
      >
        {/* Header toolbar */}
        <div className="flex justify-between items-center p-5 border-b border-slate-850/80 shrink-0">
          <span className="text-[10px] font-extrabold uppercase text-indigo-400 tracking-wider">Hồ Sơ Cá Nhân ZNet</span>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-950/50 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-xs text-slate-400">Đang đồng bộ thông tin...</p>
            </div>
          ) : errorMsg ? (
            <div className="text-center py-8 text-rose-450 text-xs font-semibold">
              <p>{errorMsg}</p>
            </div>
          ) : profile ? (
            <div className="space-y-6">
              
              {/* Profile Card Header */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 bg-slate-950/30 border border-slate-850 rounded-2xl text-center sm:text-left">
                <img 
                  referrerPolicy="no-referrer" 
                  src={profile.avatar} 
                  alt={profile.username} 
                  className="w-16 h-16 rounded-2xl object-cover border border-slate-800 shrink-0 bg-slate-900" 
                />
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h3 className="text-sm font-bold text-white">{profile.username}</h3>
                    {profile.role === 'admin' && (
                      <span className="text-[8px] tracking-widest font-extrabold px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/25 rounded-md uppercase">ADMIN</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-350 italic break-words">"{profile.status}"</p>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="grid grid-cols-2 gap-3" id="relationship_actions">
                {/* 1. Chat now button */}
                {profile.relationshipStatus === 'accepted' ? (
                  <button 
                    onClick={() => {
                      if (onStartChat) {
                        onStartChat({
                          id: profile.id,
                          username: profile.username,
                          avatar: profile.avatar,
                          status: profile.status
                        });
                      }
                      onClose();
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Gửi tin nhắn
                  </button>
                ) : (
                  <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-2.5 text-center text-[10px] text-slate-400 flex items-center justify-center">
                    Kết bạn để chat trực tiếp
                  </div>
                )}

                {/* 2. Friendship Actions logic */}
                <div className="flex shrink-0">
                  {profile.relationshipStatus === 'none' && (
                    <button
                      onClick={handleAddFriend}
                      disabled={isProcessingFriendship}
                      className="w-full bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/25 font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Kết bạn ZNet
                    </button>
                  )}

                  {profile.relationshipStatus === 'pending' && profile.requestInitiator === currentUserId && (
                    <button
                      onClick={handleUnfriend}
                      disabled={isProcessingFriendship}
                      className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 border border-rose-500/25 font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <UserMinus className="w-3.5 h-3.5" /> Hủy lời mời
                    </button>
                  )}

                  {profile.relationshipStatus === 'pending' && profile.requestInitiator !== currentUserId && (
                    <button
                      onClick={handleAcceptFriend}
                      disabled={isProcessingFriendship}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Chấp nhận kết bạn
                    </button>
                  )}

                  {profile.relationshipStatus === 'accepted' && (
                    <button
                      onClick={handleUnfriend}
                      disabled={isProcessingFriendship}
                      className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 border border-rose-500/25 font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                    >
                      <UserMinus className="w-3.5 h-3.5" /> Hủy kết bạn
                    </button>
                  )}
                </div>
              </div>

              {/* Group Chat Invite Option */}
              {myGroups.length > 0 && (
                <div className="bg-slate-950/20 border border-slate-850 p-4 rounded-2xl space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Thêm {profile.username} vào Nhóm Trò Chuyện</span>
                  
                  {inviteMsg && <p className="text-[10px] text-emerald-400">{inviteMsg}</p>}
                  {inviteError && <p className="text-[10px] text-rose-400">{inviteError}</p>}

                  <form onSubmit={handleInviteToGroup} className="flex gap-2">
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      required
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">-- Chọn nhóm của bạn --</option>
                      {myGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={isInviting || !selectedGroupId}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      {isInviting ? 'Đang thêm...' : 'Thêm'}
                    </button>
                  </form>
                </div>
              )}

              {/* Recent Status Feed Lists */}
              <div className="space-y-3.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hoạt động đăng gần đây</span>
                
                {profile.recentFeeds.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic">Thành viên này hiện chưa cập nhật chia sẻ trạng thái nào.</p>
                ) : (
                  <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                    {profile.recentFeeds.map(post => {
                      return (
                        <div key={post.id} className="bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl space-y-2">
                          <p className="text-xs text-slate-250 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                          <div className="flex justify-between items-center text-[9px] text-slate-500 pt-1">
                            <span>{new Date(post.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            <span>Lượt thích ({post.likesCount})</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
