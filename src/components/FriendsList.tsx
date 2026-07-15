/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Check, X, ShieldAlert, Clock, UserCheck, MessageSquare, RefreshCw, Pin, UserMinus } from 'lucide-react';
import { Friend } from '../types';

interface FriendsListProps {
  token: string;
  currentUserId: number;
  onSelectFriend: (friend: Friend) => void;
  selectedFriendId: number | null;
}

export default function FriendsList({ token, currentUserId, onSelectFriend, selectedFriendId }: FriendsListProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [pinnedFriendIds, setPinnedFriendIds] = useState<number[]>([]);
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');
  const [errMessage, setErrMessage] = useState<string>('');

  // LocalStorage logic for pinned friends
  useEffect(() => {
    if (currentUserId) {
      const stored = localStorage.getItem(`znet_pinned_friends_${currentUserId}`);
      if (stored) {
        try {
          setPinnedFriendIds(JSON.parse(stored));
        } catch (e) {
          console.error('Error parsing pinned friends:', e);
        }
      } else {
        setPinnedFriendIds([]);
      }
    } else {
      setPinnedFriendIds([]);
    }
  }, [currentUserId]);

  const togglePinFriend = (friendId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextPinned = pinnedFriendIds.includes(friendId)
      ? pinnedFriendIds.filter(id => id !== friendId)
      : [...pinnedFriendIds, friendId];
    setPinnedFriendIds(nextPinned);
    localStorage.setItem(`znet_pinned_friends_${currentUserId}`, JSON.stringify(nextPinned));
  };

  const handleUnfriend = async (friendId: number, username: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Bạn có chắc chắn muốn hủy kết bạn với ${username} không?`)) {
      return;
    }
    try {
      const res = await fetch('/api/friends/unfriend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ friendId })
      });
      if (res.ok) {
        setFeedbackMsg(`Đã hủy kết bạn với ${username} thành công.`);
        setTimeout(() => setFeedbackMsg(''), 3000);
        fetchFriendsAndRequests();
      } else {
        const data = await res.json();
        setErrMessage(data.error || 'Hủy kết bạn thất bại.');
        setTimeout(() => setErrMessage(''), 3000);
      }
    } catch (err: any) {
      console.error("Unfriend error:", err);
      setErrMessage('Lỗi hệ thống khi hủy kết bạn.');
      setTimeout(() => setErrMessage(''), 3000);
    }
  };

  const fetchFriendsAndRequests = async () => {
    try {
      setIsLoading(true);
      setErrMessage('');
      const res = await fetch('/api/friends/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Không thể đồng bộ danh sách từ máy chủ');
      }
      const data = await res.json();
      setFriends(data.friends || []);
      setIncomingRequests(data.incoming || []);
      setOutgoingRequests(data.outgoing || []);
    } catch (err: any) {
      console.error("Fetch friends error:", err);
      setErrMessage(err.message || 'Lỗi đồng bộ danh sách kết bạn.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      setErrMessage('');
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Tìm kiếm người dùng thất bại');
      }
      const data = await res.json();
      setSearchResults(data);
    } catch (err: any) {
      console.error("Search users failed:", err);
      setErrMessage(err.message || 'Không tìm thấy kết quả phù hợp.');
    } finally {
      setIsSearching(false);
    }
  };

  const sendFriendRequest = async (friendId: number) => {
    try {
      setErrMessage('');
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ friendId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gửi lời mời kết bạn thất bại');
      }
      setFeedbackMsg('Đã gửi lời mời kết bạn thành công!');
      setTimeout(() => setFeedbackMsg(''), 3000);
      
      // Re-trigger searches or lists
      if (searchQuery) {
        // Mock update in search results locally
        setSearchResults(prev =>
          prev.map(user => {
            if (user.id === friendId) {
              return { ...user, relationship_status: 'pending', request_initiator: currentUserId };
            }
            return user;
          })
        );
      }
      fetchFriendsAndRequests();
    } catch (err: any) {
      setErrMessage(err.message || 'Lỗi gửi yêu cầu kết bạn.');
    }
  };

  const respondToRequest = async (friendId: number, action: 'accept' | 'decline') => {
    try {
      setErrMessage('');
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ friendId, action })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Xử lý lời mời kết bạn thất bại');
      }
      
      setFeedbackMsg(action === 'accept' ? 'Đã đồng ý kết bạn!' : 'Đã từ chối lời mời');
      setTimeout(() => setFeedbackMsg(''), 3000);
      
      fetchFriendsAndRequests();
    } catch (err: any) {
      setErrMessage(err.message || 'Lỗi thực hiện phản hồi kết bạn.');
    }
  };

  // Run on mount
  useEffect(() => {
    fetchFriendsAndRequests();
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden" id="friends_outer_list">
      {/* Header and Sync Control */}
      <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold font-sans tracking-tight text-white mb-0.5">Mạng Lưới ZNet</h3>
          <p className="text-slate-400 text-xs">Kết nối và quản lý danh sách bạn bè</p>
        </div>
        <button
          onClick={fetchFriendsAndRequests}
          disabled={isLoading}
          className="p-2 border border-slate-800 bg-slate-950/40 text-slate-400 hover:text-white rounded-xl hover:bg-slate-950 transition cursor-pointer disabled:opacity-40"
          title="Đồng bộ danh sách"
          id="friends_sync_btn"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {feedbackMsg && (
        <div className="mx-5 mt-4 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2 text-emerald-400 text-xs animate-fade-in" id="friends_feedback_toast">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {errMessage && (
        <div className="mx-5 mt-4 flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2 text-rose-400 text-xs animate-fade-in" id="friends_error_toast">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>{errMessage}</span>
        </div>
      )}

      {/* Content scroll area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6" id="friends_scroll_area">
        {/* Search tool block */}
        <div className="space-y-3" id="friends_search_tool">
          <form onSubmit={handleSearchUsers} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Tìm bạn theo tài khoản..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) setSearchResults([]);
                }}
                className="w-full bg-slate-950/60 border border-slate-800 text-white placeholder-slate-550 rounded-xl py-2 pl-3 pr-9 text-xs focus:outline-none focus:border-indigo-500 transition"
                id="friends_search_input"
              />
              <Search className="absolute right-3 top-3 w-3.5 h-3.5 text-slate-500" />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2 text-xs font-semibold hover:scale-105 transition cursor-pointer"
              id="friends_search_submit_btn"
            >
              Tìm
            </button>
          </form>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3 space-y-2.5 max-h-56 overflow-y-auto" id="friends_results_panel">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Kết quả tìm kiếm</span>
              {searchResults.map((user) => (
                <div key={user.id} className="flex items-center justify-between gap-3 bg-slate-900/60 border border-slate-850/60 rounded-xl p-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img referrerPolicy="no-referrer" src={user.avatar} alt="Avatar" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{user.username}</h4>
                      <p className="text-[10px] text-slate-400 truncate">{user.status}</p>
                    </div>
                  </div>
                  
                  {/* Logic for relationship actions */}
                  <div>
                    {user.relationship_status === 'accepted' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg px-2 py-1">
                        <UserCheck className="w-3 h-3" />Bạn bè
                      </span>
                    ) : user.relationship_status === 'pending' ? (
                      user.request_initiator === currentUserId ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-slate-800 text-slate-400 rounded-lg px-2 py-1">
                          <Clock className="w-3 h-3" />Đã gửi
                        </span>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            onClick={() => respondToRequest(user.id, 'accept')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white p-1 rounded-lg"
                            title="Chấp nhận"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => respondToRequest(user.id, 'decline')}
                            className="bg-rose-600 hover:bg-rose-500 text-white p-1 rounded-lg"
                            title="Xoá"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    ) : (
                      <button
                        onClick={() => sendFriendRequest(user.id)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 hover:scale-103 transition cursor-pointer"
                      >
                        <UserPlus className="w-3 h-3" />Kết bạn
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Incoming requests block */}
        {incomingRequests.length > 0 && (
          <div className="space-y-3" id="friends_incoming_block">
            <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Lời kết bạn đến ({incomingRequests.length})
            </h4>
            <div className="grid grid-cols-1 gap-2.5">
              {incomingRequests.map((reqUser) => (
                <div key={reqUser.id} className="flex items-center justify-between gap-3 bg-emerald-950/10 border border-emerald-500/10 rounded-2xl p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img referrerPolicy="no-referrer" src={reqUser.avatar} alt="Avatar" className="w-9 h-9 rounded-xl object-cover shrink-0 border border-emerald-500/20" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-white truncate">{reqUser.username}</h4>
                      <p className="text-[10px] text-slate-400 truncate">{reqUser.status}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => respondToRequest(reqUser.id, 'accept')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded-xl transition cursor-pointer shadow-md"
                      title="Chấp nhận"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => respondToRequest(reqUser.id, 'decline')}
                      className="bg-rose-600 hover:bg-rose-500 text-white p-1.5 rounded-xl transition cursor-pointer shadow-md"
                      title="Từ chối"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confirmed Friends list */}
        <div className="space-y-3" id="friends_confirmed_block">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Danh sách bạn bè ({friends.length})</h4>
          
          {friends.length === 0 ? (
            <div className="text-center py-8 bg-slate-950/30 rounded-2xl border border-slate-850/60 p-4">
              <p className="text-slate-500 text-xs">Chưa có bạn bè nào.</p>
              <p className="text-slate-600 text-[10px] mt-1">Sử dụng thanh tìm kiếm để kết nối với những người dùng hệ thống khác!</p>
            </div>
          ) : (
            <div className="space-y-2.5" id="friends_card_container">
              {[...friends]
                .sort((a, b) => {
                  const aPinned = pinnedFriendIds.includes(a.id);
                  const bPinned = pinnedFriendIds.includes(b.id);
                  if (aPinned && !bPinned) return -1;
                  if (!aPinned && bPinned) return 1;
                  return 0;
                })
                .map((friend) => {
                  const isPinned = pinnedFriendIds.includes(friend.id);
                  return (
                    <div
                      key={friend.id}
                      onClick={() => onSelectFriend(friend)}
                      className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition cursor-pointer ${
                        selectedFriendId === friend.id
                          ? 'bg-indigo-600/10 border-indigo-500/40 ring-1 ring-indigo-500/25'
                          : 'bg-slate-950/40 border-slate-850 hover:bg-slate-950/80 hover:border-slate-800'
                      }`}
                      id={`friend_card_${friend.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="relative shrink-0">
                          <img referrerPolicy="no-referrer" src={friend.avatar} alt="Avatar" className="w-10 h-10 rounded-2xl object-cover" />
                          {/* Presence indicator */}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                            friend.isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <h4 className="text-xs font-bold text-white truncate">{friend.username}</h4>
                            {isPinned && (
                              <span className="inline-flex items-center gap-0.5 p-0.5 px-1 bg-amber-500/10 text-amber-400 rounded-md border border-amber-500/20 text-[8px] font-bold uppercase shrink-0">
                                <Pin className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                Ghim
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">{friend.status}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Pin/Unpin friend */}
                        <button
                          onClick={(e) => togglePinFriend(friend.id, e)}
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${
                            isPinned
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                              : 'bg-slate-950/40 border-slate-850 text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                          }`}
                          title={isPinned ? "Bỏ ghim bạn bè" : "Ghim bạn bè lên đầu"}
                          id={`pin_friend_btn_${friend.id}`}
                        >
                          <Pin className={`w-3 h-3 ${isPinned ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                        
                        {/* Unfriend button */}
                        <button
                          onClick={(e) => handleUnfriend(friend.id, friend.username, e)}
                          className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/20 text-red-400/80 hover:text-red-400 transition cursor-pointer"
                          title="Hủy kết bạn"
                          id={`unfriend_btn_${friend.id}`}
                        >
                          <UserMinus className="w-3 h-3" />
                        </button>

                        <span className="p-1.5 border border-slate-850 bg-slate-950/60 text-slate-400 rounded-lg flex items-center justify-center">
                          <MessageSquare className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
