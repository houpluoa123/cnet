/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, Clock, Sparkles, Check, UserCheck, Trash2, Undo2, Search, Filter, Calendar, X, Download } from 'lucide-react';
import { Friend, Message } from '../types';
import EmojiPicker from './EmojiPicker';

interface ChatWindowProps {
  friend: Friend;
  messages: Message[];
  currentUserId: number;
  onSendMessage: (text: string) => void;
  isFriendTyping: boolean;
  onSendTypingState: (isTyping: boolean) => void;
  onRecallMessage?: (messageId: number, friendId: number) => void;
  onDeleteMessageSide?: (messageId: number, friendId: number) => void;
}

export default function ChatWindow({
  friend,
  messages,
  currentUserId,
  onSendMessage,
  isFriendTyping,
  onSendTypingState,
  onRecallMessage,
  onDeleteMessageSide
}: ChatWindowProps) {
  const [inputText, setInputText] = useState<string>('');
  const [isSelfTyping, setIsSelfTyping] = useState<boolean>(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const typingTimerRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Search and filter states
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Download entire chat history as formatted JSON file
  const handleDownloadChat = () => {
    try {
      const chatData = {
        friendName: friend.username,
        friendId: friend.id,
        downloadedAt: new Date().toISOString(),
        totalMessages: messages.length,
        messages: messages.map(msg => ({
          messageId: msg.id,
          senderId: msg.senderId,
          senderName: msg.senderId === currentUserId ? 'Bạn' : friend.username,
          text: msg.isRecalled === 1 ? 'Tin nhắn đã thu hồi' : msg.text,
          createdAt: msg.createdAt,
          isRecalled: msg.isRecalled === 1
        }))
      };
      
      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Direct_Chat_${friend.username}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading direct chat:', err);
    }
  };

  // Auto-scroll to bottom on incoming messages or friend changes
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
  }, [messages, isFriendTyping]);

  // Handle typing state triggers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const val = e.target.value;
      setInputText(val);

      if (!isSelfTyping) {
        setIsSelfTyping(true);
        onSendTypingState(true);
      }

      // Reset typing debouncer
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      typingTimerRef.current = setTimeout(() => {
        setIsSelfTyping(false);
        onSendTypingState(false);
      }, 2500);
    } catch (err) {
      console.error("Typing detection failed:", err);
    }
  };

  const submitSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!inputText.trim()) return;
      onSendMessage(inputText);
      setInputText('');

      // Stop typing state immediately
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      setIsSelfTyping(false);
      onSendTypingState(false);
    } catch (error) {
      console.error("Submit message failed:", error);
    }
  };

  // Pre-configured quick messages
  const quickTexts = [
    'Alo! Bạn khoẻ không? 👋',
    'ZNet mượt quá bạn ơi! 🚀',
    'Nhắn tin nhanh thật đấy! ⚡',
    'Có gì mới không? 🤔'
  ];

  const handleQuickTextClick = (text: string) => {
    onSendMessage(text);
  };

  // Filtering messages function
  const filteredMessages = messages.filter((msg) => {
    const recalled = msg.isRecalled === 1 || String(msg.text).toLowerCase().includes('đã được thu hồi');
    
    // 1. Keyword search (if present)
    if (searchQuery.trim()) {
      // If recalled, don't match standard content searches, but we can match if user specifically searches "thu hồi" or we just skip
      const textToSearch = recalled ? 'tin nhắn đã được thu hồi' : String(msg.text);
      if (!textToSearch.toLowerCase().includes(searchQuery.toLowerCase())) {
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
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden" id="chat_window_panel">
      {/* Target status bar */}
      <div className="p-5 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between" id="chat_header">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img referrerPolicy="no-referrer" src={friend.avatar} alt="Avatar" className="w-11 h-11 rounded-2xl object-cover" />
            <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
              friend.isOnline ? 'bg-emerald-500' : 'bg-slate-600'
            }`} />
          </div>
          <div>
            <h3 className="text-white text-sm font-bold truncate leading-none">{friend.username}</h3>
            <p className="text-slate-400 text-[10px] mt-1.5 truncate max-w-xs">{friend.status}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Download direct chat history as JSON */}
          <button
            onClick={handleDownloadChat}
            className="p-2 bg-slate-950/40 hover:bg-slate-800 text-slate-350 border border-slate-800/80 rounded-xl transition flex items-center gap-1.5 text-[10px] font-semibold cursor-pointer"
            title="Tải về toàn bộ lịch sử nhắn tin (JSON)"
            id="chat_download_json_btn"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tải cuộc trò chuyện</span>
          </button>

          {/* Collapsible search/filter toggle button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-xl border transition flex items-center gap-1.5 text-[10px] font-semibold cursor-pointer ${
              showFilters || searchQuery || startDate || endDate
                ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30'
                : 'bg-slate-950/40 hover:bg-slate-800 text-slate-350 border-slate-800/80'
            }`}
            title="Lọc và tìm kiếm tin nhắn"
            id="chat_toggle_filters_btn"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tìm kiếm & Lọc</span>
          </button>

          <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl px-3 py-1 font-semibold">
            <UserCheck className="w-3 h-3" />Bạn bè liên kết
          </span>
        </div>
      </div>

      {/* Search and Filters collapsible panel */}
      {showFilters && (
        <div className="p-4 bg-slate-950/40 border-b border-slate-850/80 grid grid-cols-1 md:grid-cols-12 gap-3 items-center animate-fade-in" id="chat_filter_panel">
          <div className="md:col-span-5 relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm kiếm nội dung tin nhắn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-indigo-500 transition font-sans placeholder-slate-650"
              id="chat_filter_query_input"
            />
          </div>
          
          <div className="md:col-span-3 flex items-center gap-1.5 relative">
            <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              type="date"
              placeholder="Từ ngày"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2 pl-9 pr-3 text-[11px] focus:outline-none focus:border-indigo-500 transition font-mono whitespace-nowrap"
              id="chat_filter_start_date"
              title="Từ ngày"
            />
          </div>

          <div className="md:col-span-3 flex items-center gap-1.5 relative">
            <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              type="date"
              placeholder="Đến ngày"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 text-white rounded-xl py-2 pl-9 pr-3 text-[11px] focus:outline-none focus:border-indigo-500 transition font-mono whitespace-nowrap"
              id="chat_filter_end_date"
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
                id="chat_clear_filters_btn"
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
        <div className="px-5 py-2.5 bg-indigo-500/5 border-b border-slate-850/60 flex items-center justify-between text-[11px] text-indigo-300 animate-fade-in" id="active_filter_summary">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
            <span className="truncate max-w-md">
              Đang lọc: {searchQuery && `"${searchQuery}"`}{' '}
              {startDate && ` từ ngày ${startDate}`}{' '}
              {endDate && ` đến ngày ${endDate}`}
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

      {/* Messages layout container */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-950/25" id="chat_messages_area">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/5 border border-indigo-500/15 flex items-center justify-center text-indigo-400 mb-3 animate-pulse">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="text-white text-xs font-bold font-sans">Bắt đầu cuộc trò chuyện</h4>
            <p className="text-[10px] text-slate-550 mt-1 max-w-sm">Mọi dữ liệu tin nhắn được truyền tải trực tiếp trong thời gian thực, bảo mật tuyệt đối.</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-11 h-11 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500 mb-3">
              <Search className="w-5 h-5" />
            </div>
            <h4 className="text-white text-xs font-semibold">Không tìm thấy tin nhắn trùng khớp</h4>
            <p className="text-[10px] text-slate-400 mt-1 max-w-xs leading-relaxed">Hãy thử kiểm tra lỗi chính tả hoặc điều chỉnh thời gian tìm kiếm rộng hơn.</p>
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
            
            // Check if recalled
            const recalled = msg.isRecalled === 1 || String(msg.text).toLowerCase().includes('đã được thu hồi');
            
            // Check recall ability window (5 minutes)
            const durationMs = new Date().getTime() - msgDate.getTime();
            const canRecall = isMe && !recalled && durationMs <= 5 * 60 * 1000;

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} group animate-fade-in relative`}
                id={`chat_bubble_wrapper_${msg.id}`}
              >
                <div className={`flex gap-2.5 max-w-[75%] ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end`}>
                  {!isMe && (
                    <img referrerPolicy="no-referrer" src={friend.avatar} alt="Avatar" className="w-7 h-7 rounded-lg object-cover mb-1 shrink-0" />
                  )}
                  
                  {/* Bubble body and Actions */}
                  <div className="flex items-center gap-2 group">
                    {/* Action controls (Only shows on hover) */}
                    {isMe && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition duration-200 order-1">
                        {canRecall && onRecallMessage && (
                          <button
                            onClick={() => onRecallMessage(msg.id, friend.id)}
                            className="p-1 px-2 rounded-lg bg-slate-800 hover:bg-indigo-600/35 border border-slate-700 text-slate-350 hover:text-white transition flex items-center gap-1 text-[9px] font-semibold"
                            title="Thu hồi tin nhắn (5ph)"
                          >
                            <Undo2 className="w-2.5 h-2.5" /> Thu hồi
                          </button>
                        )}
                        {onDeleteMessageSide && (
                          <button
                            onClick={() => onDeleteMessageSide(msg.id, friend.id)}
                            className="p-1 px-2 rounded-lg bg-slate-800 hover:bg-rose-500/30 border border-slate-700 text-slate-350 hover:text-rose-400 transition flex items-center gap-1 text-[9px] font-semibold"
                            title="Xóa cuộc trò chuyện phía tôi"
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
                      
                      <div className={`flex items-center gap-1 text-[9px] text-slate-550 mt-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <span>{timeLabel}</span>
                        {isMe && !recalled && <Check className="w-2.5 h-2.5 text-indigo-400" />}
                      </div>
                    </div>

                    {!isMe && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition duration-200">
                        {onDeleteMessageSide && (
                          <button
                            onClick={() => onDeleteMessageSide(msg.id, friend.id)}
                            className="p-1 px-2 rounded-lg bg-slate-800 hover:bg-rose-500/30 border border-slate-700 text-slate-350 hover:text-rose-400 transition flex items-center gap-1 text-[9px] font-semibold"
                            title="Xóa cuộc trò chuyện phía tôi"
                          >
                            <Trash2 className="w-2.5 h-2.5" /> Xóa phía tôi
                          </button>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Real-time Friend typing indicator */}
        {isFriendTyping && (
          <div className="flex justify-start animate-fade-in" id="chat_typing_indicator_block">
            <div className="flex gap-2.5 items-end">
              <img referrerPolicy="no-referrer" src={friend.avatar} alt="Avatar" className="w-7 h-7 rounded-lg object-cover shrink-0" />
              <div className="bg-slate-800 rounded-2xl rounded-bl-none p-3.5 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                <span className="text-[10px] text-slate-400 ml-1.5">{friend.username} đang soạn tin...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Suggested Quick Texts */}
      <div className="px-5 py-2.5 border-t border-slate-850/80 bg-slate-900/60 overflow-x-auto whitespace-nowrap flex gap-2 shrink-0 scrollbar-none">
        {quickTexts.map((textStr, index) => (
          <button
            key={index}
            onClick={() => handleQuickTextClick(textStr)}
            className="text-[10px] font-medium bg-slate-950/60 text-slate-400 hover:text-white border border-slate-850/80 rounded-xl px-3 py-1.5 transition cursor-pointer hover:bg-slate-950 hover:border-slate-750"
            id={`chat_quick_text_${index}`}
          >
            {textStr}
          </button>
        ))}
      </div>

      {/* Message input area */}
      <div className="p-5 border-t border-slate-800/80 bg-slate-900/80" id="chat_input_panel">
        <form onSubmit={submitSendMessage} className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Nhập tin nhắn để gửi đi..."
              value={inputText}
              maxLength={1000}
              onChange={handleInputChange}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl py-3.5 pl-4 pr-11 text-xs focus:outline-none focus:border-indigo-500 transition"
              id="chat_input_message_text"
            />
            
            <div className="absolute right-3.5 top-3.5 flex items-center">
              <button
                type="button"
                className={`p-0.5 transition cursor-pointer ${showEmojiPicker ? 'text-indigo-400' : 'text-slate-500 hover:text-indigo-400'}`}
                title="Thêm biểu tượng"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                id="chat_emoji_toggle_button"
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
            id="chat_send_button"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
