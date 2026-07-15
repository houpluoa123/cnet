import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, Users, UserPlus, Sparkles, Check, Loader2, Info, Share2, Trash2, Undo2, Search, Calendar, X, Download } from 'lucide-react';
import { ChatGroup, GroupMessage, Friend } from '../types';
import EmojiPicker from './EmojiPicker';

interface GroupChatWindowProps {
  group: ChatGroup;
  messages: GroupMessage[];
  currentUserId: number;
  onSendGroupMessage: (text: string) => void;
  token: string;
  onRecallGroupMessage?: (messageId: number, groupId: number) => void;
  onDeleteGroupMessageSide?: (messageId: number, groupId: number) => void;
}

export default function GroupChatWindow({
  group,
  messages,
  currentUserId,
  onSendGroupMessage,
  token,
  onRecallGroupMessage,
  onDeleteGroupMessageSide
}: GroupChatWindowProps) {
  const [inputText, setInputText] = useState<string>('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [showInviteDrawer, setShowInviteDrawer] = useState<boolean>(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState<number | null>(null);
  const [inviteError, setInviteError] = useState<string>('');
  const [inviteSuccess, setInviteSuccess] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState<string>('');
  
  // Modal to show group members
  const [showMembersModal, setShowMembersModal] = useState<boolean>(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');
  
  // States of pending join requests for creator/admin
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [showRequestsTab, setShowRequestsTab] = useState<boolean>(false);
  const [isProcessingRequest, setIsProcessingRequest] = useState<number | null>(null);

  // Search and filter states
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Download entire group chat history as formatted JSON file
  const handleDownloadChat = () => {
    try {
      const chatData = {
        groupName: group.name,
        groupId: group.id,
        isPrivate: group.isPrivate === 1,
        downloadedAt: new Date().toISOString(),
        totalMessages: messages.length,
        messages: messages.map(msg => ({
          messageId: msg.id,
          senderId: msg.senderId,
          senderName: msg.senderName || (msg.senderId === currentUserId ? 'Bạn' : 'Thành viên'),
          text: msg.isRecalled === 1 ? 'Tin nhắn đã thu hồi' : msg.text,
          createdAt: msg.createdAt,
          isRecalled: msg.isRecalled === 1
        }))
      };
      
      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Group_Chat_${group.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading group chat:', err);
    }
  };

  const chatBottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    try {
      if (chatBottomRef.current) {
        chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (e) {
      console.warn("Scroll to bottom failed", e);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load friends and loaded group members
  const loadGroupMembersAndFriends = async () => {
    try {
      // Fetch friends for invitation list
      const friendsRes = await fetch('/api/friends/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (friendsRes.ok) {
        const data = await friendsRes.json();
        setFriends(data.friends || []);
      }
    } catch (err) {
      console.error('Failed to load friends list:', err);
    }
  };

  const loadGroupMembers = async () => {
    try {
      const res = await fetch(`/api/groups/${group.id}/members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroupMembers(data || []);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loadPendingJoinRequests = async () => {
    // Only load if group is private and current user is creator/admin
    if (group.isPrivate === 1) {
      try {
        const res = await fetch(`/api/groups/${group.id}/requests`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setPendingRequests(data || []);
        }
      } catch (err) {
        console.error("Load group join requests error:", err);
      }
    }
  };

  useEffect(() => {
    loadGroupMembersAndFriends();
    loadGroupMembers();
    loadPendingJoinRequests();
    setShowRequestsTab(false);
  }, [group.id]);

  const handleInviteFriend = async (friendId: number) => {
    setInviteError('');
    setInviteSuccess('');
    setIsAdding(friendId);
    try {
      const res = await fetch('/api/groups/add-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ groupId: group.id, memberId: friendId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Mời thành viên thất bại');
      }
      setInviteSuccess('Đã thêm thành viên vào nhóm!');
      loadGroupMembers();
      setTimeout(() => setInviteSuccess(''), 3000);
    } catch (err: any) {
      setInviteError(err.message);
    } finally {
      setIsAdding(null);
    }
  };

  const handleApproveRequest = async (requestId: number) => {
    setIsProcessingRequest(requestId);
    try {
      const res = await fetch(`/api/groups/${group.id}/requests/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setPendingRequests(prev => prev.filter(r => r.id !== requestId));
        loadGroupMembers();
      } else {
        const d = await res.json();
        alert(d.error || 'Phê duyệt thất bại');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessingRequest(null);
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    setIsProcessingRequest(requestId);
    try {
      const res = await fetch(`/api/groups/${group.id}/requests/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      } else {
        const d = await res.json();
        alert(d.error || 'Từ chối thất bại');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessingRequest(null);
    }
  };

  const handleCopyInviteLink = () => {
    try {
      const shareUrl = `${window.location.origin}/join-group/${group.id}`;
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch (err) {
      console.error('Copy link failed: ', err);
    }
  };

  const submitSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendGroupMessage(inputText);
    setInputText('');
  };

  const quickTexts = [
    'Chào cả nhà mình nhé! 👋',
    'Nhắm link gửi cho mọi người nha! 🚀',
    'Phê duyệt thành viên mới giúp tớ với! ⚙️',
    'Họp nhóm online thôi anh em ơi! 💻'
  ];

  const handleQuickTextClick = (text: string) => {
    onSendGroupMessage(text);
  };

  const isCreatorOrAdmin = group.creatorId === currentUserId;

  // Filtering group messages
  const filteredMessages = messages.filter((msg) => {
    const recalled = msg.isRecalled === 1 || String(msg.text).toLowerCase().includes('đã được thu hồi');
    
    // 1. Keyword search (if present)
    if (searchQuery.trim()) {
      const textToSearch = recalled ? 'tin nhắn đã được thu hồi' : String(msg.text);
      // We can also match sender name for group chats, which will make it extra cool!
      const senderName = String(msg.senderName || '');
      const contentMatched = textToSearch.toLowerCase().includes(searchQuery.toLowerCase());
      const senderMatched = senderName.toLowerCase().includes(searchQuery.toLowerCase());
      if (!contentMatched && !senderMatched) {
        return false;
      }
    }

    // 2. Date range filter
    const msgDate = new Date(msg.createdAt);
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (msgDate < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (msgDate > end) return false;
    }

    return true;
  });

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden" id="group_window_panel">
      {/* Group header details bar */}
      <div className="p-5 border-b border-slate-800/80 bg-slate-900/40 flex flex-wrap gap-4 items-center justify-between animate-fade-in" id="group_header">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div
            onClick={() => {
              loadGroupMembers();
              setShowMembersModal(true);
            }}
            className="cursor-pointer hover:opacity-85 transition group/title"
            title="Xem danh sách thành viên nhóm"
          >
            <div className="flex items-center gap-2">
              <h3 className="text-white text-sm font-bold truncate leading-none group-hover/title:text-indigo-400 transition">{group.name}</h3>
              <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                group.isPrivate === 1
                  ? 'bg-amber-500/10 text-amber-400 border-amber-550/25'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-550/25'
              }`}>
                {group.isPrivate === 1 ? 'Riêng tư' : 'Công khai'}
              </span>
            </div>
            <p className="text-slate-400 text-[10px] mt-1.5 leading-none group-hover/title:text-indigo-300 transition">Mã số nhóm: #{group.id} • {groupMembers.length} thành viên</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Download group chat history as JSON */}
          <button
            onClick={handleDownloadChat}
            className="px-3 py-1.5 rounded-xl border border-slate-800/80 bg-slate-950/40 hover:bg-slate-800 text-[9px] font-bold flex items-center gap-1.5 transition cursor-pointer text-slate-350"
            title="Tải về toàn bộ lịch sử nhắn tin của nhóm (JSON)"
            id="group_download_json_btn"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải tin nhắn</span>
          </button>

          {/* Approved requests indicator for creators/admins */}
          {group.isPrivate === 1 && isCreatorOrAdmin && pendingRequests.length > 0 && (
            <button
              onClick={() => {
                setShowRequestsTab(prev => !prev);
                setShowInviteDrawer(false);
              }}
              className={`text-[9px] font-bold px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 transition ${
                showRequestsTab 
                  ? 'bg-amber-600 border-amber-500 text-white' 
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
              }`}
            >
              Duyệt yêu cầu ({pendingRequests.length})
            </button>
          )}

          {/* Copy invite link to share */}
          <button
            onClick={handleCopyInviteLink}
            className={`px-3 py-1.5 rounded-xl border text-[9px] font-bold flex items-center gap-1.5 transition ${
              copiedLink 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' 
                : 'bg-slate-950/40 hover:bg-slate-800 text-slate-350 border-slate-800'
            }`}
            title="Nhân bản liên kết nhóm gửi cho bạn bè"
          >
            <Share2 className="w-3 h-3" /> {copiedLink ? 'Đã sao chép link!' : 'Chia sẻ link'}
          </button>

          {/* Search/Filter action button */}
          <button
            onClick={() => {
              setShowFilters(!showFilters);
              setShowRequestsTab(false);
            }}
            className={`px-3 py-1.5 rounded-xl border text-[9px] font-bold flex items-center gap-1.5 transition ${
              showFilters || searchQuery || startDate || endDate
                ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30'
                : 'bg-slate-950/40 hover:bg-slate-800 text-slate-350 border-slate-800/80'
            }`}
            title="Tìm kiếm và lọc tin nhắn nhóm"
            id="group_toggle_filters_btn"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Tìm kiếm & Lọc</span>
          </button>

          <button
            onClick={() => {
              setShowInviteDrawer(prev => !prev);
              setShowRequestsTab(false);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer transition"
          >
            <UserPlus className="w-3.5 h-3.5" /> Mời bạn bè
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* Main Area based on requests tab toggling */}
        <div className="flex-1 flex flex-col min-w-0">
          {showRequestsTab ? (
            /* Pending Requests Panel */
            <div className="flex-1 overflow-y-auto p-5 bg-slate-950/20 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-850">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider text-amber-400">Yêu cầu xét duyệt tham gia nhóm ({pendingRequests.length})</h4>
                <button 
                  onClick={() => setShowRequestsTab(false)}
                  className="text-[10px] text-slate-450 hover:text-white"
                >
                  Đóng mục duyệt
                </button>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs italic">
                  Không có yêu cầu duyệt nào còn chờ xử lý.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map(req => (
                    <div key={req.id} className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <img referrerPolicy="no-referrer" src={req.avatar} alt="Avatar" className="w-8 h-8 rounded-lg object-cover bg-slate-900 shrink-0" />
                        <div>
                          <p className="text-xs text-white font-bold">{req.username}</p>
                          <p className="text-[10px] text-slate-400 mt-1">"{req.userStatus || 'Hi, I am using ZNet!'}"</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApproveRequest(req.id)}
                          disabled={isProcessingRequest === req.id}
                          className="bg-emerald-600 hover:bg-emerald-500 text-[10px] text-white font-bold py-1.5 px-3 rounded-lg transition"
                        >
                          Chấp nhận
                        </button>
                        <button
                          onClick={() => handleRejectRequest(req.id)}
                          disabled={isProcessingRequest === req.id}
                          className="bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-[10px] text-slate-400 font-bold py-1.5 px-3 rounded-lg transition border border-slate-700"
                        >
                          Từ chối
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Standard Messages Lists rendering flow */
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {/* Search and Filters collapsible panel */}
              {showFilters && (
                <div className="p-4 bg-slate-950/40 border-b border-slate-850/80 grid grid-cols-1 md:grid-cols-12 gap-3 items-center animate-fade-in" id="group_filter_panel">
                  <div className="md:col-span-5 relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Tìm theo nội dung hoặc người gửi..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-indigo-500 transition font-sans placeholder-slate-650"
                      id="group_filter_query_input"
                    />
                  </div>
                  
                  <div className="md:col-span-3 flex items-center gap-1.5 relative">
                    <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2 pl-9 pr-3 text-[11px] focus:outline-none focus:border-indigo-500 transition font-mono"
                      id="group_filter_start_date"
                      title="Từ ngày"
                    />
                  </div>

                  <div className="md:col-span-3 flex items-center gap-1.5 relative">
                    <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2 pl-9 pr-3 text-[11px] focus:outline-none focus:border-indigo-500 transition font-mono"
                      id="group_filter_end_date"
                      title="Đến ngày"
                    />
                  </div>

                  <div className="md:col-span-1 flex justify-end">
                    {(searchQuery || startDate || endDate) ? (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setStartDate('');
                          setEndDate('');
                        }}
                        className="p-2 bg-rose-550/10 hover:bg-rose-500/20 text-rose-450 border border-rose-500/25 rounded-xl transition cursor-pointer text-[10px] font-bold w-full text-center flex items-center justify-center gap-1"
                        title="Xóa bộ lọc"
                        id="group_clear_filters_btn"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span className="md:hidden">Xóa lọc</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowFilters(false)}
                        className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition cursor-pointer text-[10px] w-full text-center flex items-center justify-center gap-1"
                        title="Đóng bảng lọc"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span className="md:hidden">Đóng</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Active notification indicator banner if filters are filled */}
              {(searchQuery || startDate || endDate) && (
                <div className="px-5 py-2.5 bg-indigo-500/5 border-b border-slate-850/60 flex items-center justify-between text-[11px] text-indigo-300 animate-fade-in" id="group_active_filter_summary">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                    <span className="truncate max-w-md">
                      Đang lọc cuộc trò chuyện nhóm:{' '}
                      {searchQuery && `"${searchQuery}"`}{' '}
                      {startDate && ` từ ${startDate}`}{' '}
                      {endDate && ` đến ${endDate}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-slate-400">Tìm thấy {filteredMessages.length} tin</span>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setStartDate('');
                        setEndDate('');
                      }}
                      className="text-indigo-400 hover:text-indigo-300 hover:underline transition cursor-pointer font-bold"
                    >
                      Đặt lại
                    </button>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-950/25 animate-fade-in" id="group_messages_area">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/5 border border-indigo-500/15 flex items-center justify-center text-indigo-400 mb-3 animate-pulse">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h4 className="text-white text-xs font-bold font-sans">Bắt đầu trò chuyện nhóm</h4>
                    <p className="text-[10px] text-slate-550 mt-1 max-w-sm leading-relaxed">
                      Gửi tin nhắn đầu tiên của bạn vào nhóm. Tất cả thành viên trực tuyến sẽ nhận được ngay lập tức theo thời gian thực.
                    </p>
                  </div>
                ) : filteredMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <div className="w-11 h-11 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500 mb-3">
                      <Search className="w-5 h-5" />
                    </div>
                    <h4 className="text-white text-xs font-semibold">Không tìm thấy tin nhắn trùng khớp</h4>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-xs leading-relaxed">Hãy thử kiểm tra từ khóa hoặc điều chỉnh thời gian tìm kiếm rộng hơn.</p>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setStartDate('');
                        setEndDate('');
                      }}
                      className="mt-4 text-[10px] bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 font-bold border border-indigo-550/25 rounded-xl px-3 py-1.5 transition cursor-pointer"
                    >
                      Hủy bộ lọc và xem tất cả
                    </button>
                  </div>
                ) : (
                  filteredMessages.map((msg) => {
                    const isMe = msg.senderId === currentUserId;
                    const msgDate = new Date(msg.createdAt);
                    const timeLabel = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    const recalled = msg.isRecalled === 1 || String(msg.text).toLowerCase().includes('đã được thu hồi');
                    const durationMs = new Date().getTime() - msgDate.getTime();
                    const canRecall = isMe && !recalled && durationMs <= 5 * 60 * 1000;

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMe ? 'justify-end' : 'justify-start'} group animate-fade-in relative`}
                        id={`group_bubble_wrapper_${msg.id}`}
                      >
                        <div className={`flex gap-2.5 max-w-[75%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end`}>
                          {!isMe && (
                            <img 
                              referrerPolicy="no-referrer" 
                              src={msg.senderAvatar || 'https://api.dicebear.com/7.x/pixel-art/svg?seed=group'} 
                              alt="Avatar" 
                              className="w-7 h-7 rounded-lg object-cover mb-1 shrink-0 border border-slate-800" 
                            />
                          )}
                          
                          <div className="space-y-1">
                            {!isMe && (
                              <span className="text-[9px] text-indigo-400 font-bold block ml-1 leading-none">
                                {msg.senderName}
                              </span>
                            )}
                            
                            <div className="flex items-center gap-2 group">
                              {/* Action controls (hover list) */}
                              {isMe && (
                                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition duration-250 order-1">
                                  {canRecall && onRecallGroupMessage && (
                                    <button
                                      onClick={() => onRecallGroupMessage(msg.id, group.id)}
                                      className="p-1 px-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600/35 border border-slate-750 text-slate-350 hover:text-white transition flex items-center gap-1 text-[8px] font-semibold"
                                      title="Thu hồi tin nhắn nhóm (5ph)"
                                    >
                                      <Undo2 className="w-2.5 h-2.5" /> Thu hồi
                                    </button>
                                  )}
                                  {onDeleteGroupMessageSide && (
                                    <button
                                      onClick={() => onDeleteGroupMessageSide(msg.id, group.id)}
                                      className="p-1 px-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/25 border border-slate-750 text-slate-350 hover:text-rose-450 transition flex items-center gap-1 text-[8px] font-semibold"
                                      title="Xóa tin nhắn nhóm góc nhìn của tôi"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" /> Xóa phía tôi
                                    </button>
                                  )}
                                </div>
                              )}

                              <div className={isMe ? 'order-2' : ''}>
                                <div
                                  className={`p-3.5 rounded-2xl text-xs break-words shadow-sm ${
                                    recalled
                                      ? 'bg-slate-900 border border-slate-850 text-slate-500 italic'
                                      : isMe
                                        ? 'bg-gradient-to-br from-indigo-600 to-indigo-500 text-white rounded-br-none'
                                        : 'bg-slate-800 text-slate-100 rounded-bl-none'
                                  }`}
                                >
                                  {recalled ? 'Tin nhắn đã được thu hồi' : msg.text}
                                </div>
                                <div className={`flex items-center gap-1 text-[8px] text-slate-550 mt-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                  <span>{timeLabel}</span>
                                  {isMe && !recalled && <Check className="w-2.5 h-2.5 text-indigo-400" />}
                                </div>
                              </div>

                              {!isMe && (
                                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition duration-250">
                                  {onDeleteGroupMessageSide && (
                                    <button
                                      onClick={() => onDeleteGroupMessageSide(msg.id, group.id)}
                                      className="p-1 px-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/25 border border-slate-750 text-slate-350 hover:text-rose-450 transition flex items-center gap-1 text-[8px] font-semibold"
                                      title="Xóa tin nhắn nhóm góc nhìn của tôi"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" /> Xóa phía tôi
                                    </button>
                                  )}
                                </div>
                              )}

                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                <div ref={chatBottomRef} />
              </div>

              {/* Quick texts suggestions strip */}
              <div className="px-5 py-2 border-t border-slate-850/80 bg-slate-900/60 overflow-x-auto whitespace-nowrap flex gap-2 shrink-0 scrollbar-none">
                {quickTexts.map((textStr, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuickTextClick(textStr)}
                    className="text-[9px] font-medium bg-slate-950/60 text-slate-400 hover:text-white border border-slate-850/80 rounded-xl px-2.5 py-1 transition cursor-pointer hover:bg-slate-950"
                  >
                    {textStr}
                  </button>
                ))}
              </div>

              {/* Compose message input bar */}
              <div className="p-5 border-t border-slate-800/80 bg-slate-900/80 shrink-0" id="group_input_panel">
                <form onSubmit={submitSendMessage} className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Nhập tin nhắn nhóm..."
                      value={inputText}
                      maxLength={1000}
                      onChange={(e) => setInputText(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl py-3.5 pl-4 pr-11 text-xs focus:outline-none focus:border-indigo-500 transition"
                    />
                    <div className="absolute right-3.5 top-3.5 flex items-center">
                      <button
                        type="button"
                        className={`p-0.5 transition cursor-pointer ${showEmojiPicker ? 'text-indigo-400' : 'text-slate-500 hover:text-indigo-400'}`}
                        title="Thêm biểu tượng"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        id="group_emoji_toggle_button"
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      
                      {showEmojiPicker && (
                        <EmojiPicker
                          onSelectEmoji={(emoji) => {
                            setInputText(prev => prev + emoji);
                          }}
                          onClose={() => setShowEmojiPicker(false)}
                        />
                      )}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white p-3.5 rounded-2xl hover:scale-105 transition flex items-center justify-center cursor-pointer shadow-lg active:scale-95 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Invitation Sidebar */}
        {showInviteDrawer && (
          <div className="w-64 bg-slate-950/80 border-l border-slate-850 flex flex-col h-full animate-fade-in shrink-0">
            <div className="p-4 border-b border-slate-850 flex items-center justify-between shrink-0">
              <span className="text-[10px] font-bold text-slate-350 uppercase tracking-wider block">Thêm bạn bè</span>
              <button 
                onClick={() => {
                  setShowInviteDrawer(false);
                  setInviteSearchQuery('');
                }}
                className="text-xs text-slate-550 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            {/* Search Input for Invitation */}
            <div className="p-3 border-b border-slate-850 bg-slate-950/20 shrink-0">
              <input
                type="text"
                placeholder="Tìm bạn bè..."
                value={inviteSearchQuery}
                onChange={(e) => setInviteSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-white placeholder-slate-550 rounded-xl py-2 px-3 text-[10px] focus:outline-none focus:border-indigo-500 transition"
                id="invite_friend_search_input"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
              {inviteSuccess && <p className="text-[9px] text-emerald-400 text-center font-semibold bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/15">{inviteSuccess}</p>}
              {inviteError && <p className="text-[9px] text-rose-450 text-center font-semibold bg-rose-500/10 p-2 rounded-xl border border-rose-500/15">{inviteError}</p>}

              {friends.filter(f => f.username.toLowerCase().includes(inviteSearchQuery.toLowerCase())).length === 0 ? (
                <p className="text-[10px] text-slate-500 italic text-center py-6">
                  {friends.length === 0 ? 'Chưa có liên kết bạn bè để mời vào nhóm.' : 'Không tìm thấy người bạn nào phù hợp.'}
                </p>
              ) : (
                friends
                  .filter(f => f.username.toLowerCase().includes(inviteSearchQuery.toLowerCase()))
                  .map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-xl border border-slate-850 animate-fade-in">
                      <div className="flex items-center gap-2 min-w-0">
                        <img referrerPolicy="no-referrer" src={friend.avatar} alt={friend.username} className="w-7 h-7 rounded-lg object-cover border border-slate-800" />
                        <span className="text-[11px] font-bold text-white truncate max-w-[90px]">{friend.username}</span>
                      </div>
                      <button
                        onClick={() => handleInviteFriend(friend.id)}
                        disabled={isAdding === friend.id}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-[9px] text-white py-1 px-2.5 rounded-lg transition shrink-0"
                      >
                        {isAdding === friend.id ? '...' : 'Mời'}
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* Modal hiển thị danh sách thành viên */}
      {showMembersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in" id="group_members_modal_overlay">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" id="group_members_modal_container">
            {/* Header */}
            <div className="p-4 border-b border-slate-850 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider block">Thành viên nhóm</h4>
                  <p className="text-[10px] text-slate-400 truncate max-w-[200px] mt-0.5 font-sans">Nhóm: {group.name}</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowMembersModal(false);
                  setMemberSearchQuery('');
                }}
                className="w-7 h-7 flex items-center justify-center rounded-xl bg-slate-950/40 hover:bg-slate-850 transition text-slate-400 hover:text-white cursor-pointer text-xs"
                id="close_members_modal_btn"
              >
                ✕
              </button>
            </div>

            {/* Search members bar */}
            <div className="p-3 bg-slate-950/20 border-b border-slate-850">
              <input
                type="text"
                placeholder="Tìm thành viên trong nhóm..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white placeholder-slate-500 rounded-xl py-2 px-3 text-[10px] focus:outline-none focus:border-indigo-500 transition"
                id="search_group_member_input"
              />
            </div>

            {/* Members scrollable body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {groupMembers.filter(m => m.username.toLowerCase().includes(memberSearchQuery.toLowerCase())).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[10px] text-slate-500 italic">Không tìm thấy thành viên phù hợp trong nhóm.</p>
                </div>
              ) : (
                groupMembers
                  .filter(m => m.username.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                  .map((member) => (
                    <div key={member.id} className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-850 hover:border-slate-800 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <img 
                            referrerPolicy="no-referrer" 
                            src={member.avatar} 
                            alt={member.username} 
                            className="w-8 h-8 rounded-xl object-cover border border-slate-800" 
                          />
                          <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-slate-900 ${
                            member.isOnline === 1 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-white truncate max-w-[120px]">
                              {member.username}
                            </span>
                            {member.id === currentUserId && (
                              <span className="text-[8px] font-medium text-indigo-400 bg-indigo-500/10 px-1 rounded">
                                Bạn
                              </span>
                            )}
                          </div>
                          {member.status && (
                            <p className="text-[9px] text-slate-500 truncate max-w-[150px] mt-0.5">
                              {member.status}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Display Role badge */}
                      <span className={`text-[8px] font-extrabold uppercase px-2 py-0.5 rounded border leading-none ${
                        member.role === 'owner' || member.id === group.creatorId
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-slate-500/10 text-slate-400 border-slate-800'
                      }`}>
                        {member.role === 'owner' || member.id === group.creatorId ? 'Chủ nhóm' : 'Thành viên'}
                      </span>
                    </div>
                  ))
              )}
            </div>

            {/* Footer with summary information */}
            <div className="p-3 border-t border-slate-850 bg-slate-900/30 flex items-center justify-between text-[9px] text-slate-500 px-4">
              <span>Mạng lưới ZNet</span>
              <span>Tổng cộng: {groupMembers.length} thành viên</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
