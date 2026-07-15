/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Users,
  User as UserIcon,
  Rss,
  Activity,
  LogOut,
  ShieldAlert,
  Loader2,
  Check,
  Zap,
  Lock,
  Globe,
  FileText,
  Pin
} from 'lucide-react';
import AuthForm from './components/AuthForm';
import FriendsList from './components/FriendsList';
import ChatWindow from './components/ChatWindow';
import UserProfile from './components/UserProfile';
import FeedSection from './components/FeedSection';
import AdminConsole from './components/AdminConsole';
import UserProfileModal from './components/UserProfileModal';
import GroupChatWindow from './components/GroupChatWindow';
import ExportDocsSection from './components/ExportDocsSection';
import { User, Friend, Message, ChatGroup, GroupMessage } from './types';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('znet_auth_token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isPreAuthing, setIsPreAuthing] = useState<boolean>(true);
  
  // Custom navigation
  const [activeTab, setActiveTab] = useState<'chats' | 'friends' | 'timeline' | 'profile' | 'admin' | 'export_docs'>('timeline');
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [activeBroadcast, setActiveBroadcast] = useState<string | null>(null);

  // States of chats & connections
  const [messagesRegistry, setMessagesRegistry] = useState<{ [friendId: number]: Message[] }>({});
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [typingFriends, setTypingFriends] = useState<number[]>([]);
  const [friendsPresenceState, setFriendsPresenceState] = useState<{ [friendId: number]: boolean }>({});
  
  // Group Chat states
  const [chatMode, setChatMode] = useState<'direct' | 'group'>('direct');
  const [groupsList, setGroupsList] = useState<ChatGroup[]>([]);
  const [pinnedGroupIds, setPinnedGroupIds] = useState<number[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
  const [groupMessagesRegistry, setGroupMessagesRegistry] = useState<{ [groupId: number]: GroupMessage[] }>({});
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [isNewGroupPrivate, setIsNewGroupPrivate] = useState<boolean>(false);
  const [groupJoinLinkInput, setGroupJoinLinkInput] = useState<string>('');
  const [groupToLeave, setGroupToLeave] = useState<ChatGroup | null>(null);
  const [leavingInProgress, setLeavingInProgress] = useState<boolean>(false);

  // App theme state: 'cosmic', 'mono-dark', 'mono-light'
  const [appTheme, setAppTheme] = useState<'cosmic' | 'mono-dark' | 'mono-light'>('cosmic');

  // Load app theme from localStorage on load
  useEffect(() => {
    const stored = localStorage.getItem('znet_app_theme');
    if (stored === 'mono-dark' || stored === 'mono-light' || stored === 'cosmic') {
      setAppTheme(stored);
    }
  }, []);

  const changeAppTheme = (newTheme: 'cosmic' | 'mono-dark' | 'mono-light') => {
    setAppTheme(newTheme);
    localStorage.setItem('znet_app_theme', newTheme);
  };

  // Load pinned group IDs from localStorage scoped to currentUser
  useEffect(() => {
    if (currentUser) {
      const stored = localStorage.getItem(`znet_pinned_groups_${currentUser.id}`);
      if (stored) {
        try {
          setPinnedGroupIds(JSON.parse(stored));
        } catch (e) {
          console.error('Error parsing pinned groups:', e);
        }
      } else {
        setPinnedGroupIds([]);
      }
    } else {
      setPinnedGroupIds([]);
    }
  }, [currentUser]);

  // Floating notification states
  const [incomingNotification, setIncomingNotification] = useState<{ senderName: string, text: string, avatar: string, type: 'direct' | 'group' } | null>(null);

  // Profile modal viewing state
  const [profileUserId, setProfileUserId] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<any>(null);

  // Load user information if token exists during startup
  const fetchCurrentUserProfile = async (authToken: string) => {
    try {
      setIsPreAuthing(true);
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const userData = await res.json();
          setCurrentUser(userData);
        } else {
          console.warn("Non-JSON response from /api/auth/me during session load, clearing token", res.status);
          localStorage.removeItem('znet_auth_token');
          setToken(null);
        }
      } else {
        // Clear broken session
        localStorage.removeItem('znet_auth_token');
        setToken(null);
      }
    } catch (error) {
      console.error("Session verification failed:", error);
    } finally {
      setIsPreAuthing(false);
    }
  };

  useEffect(() => {
    try {
      if (token) {
        fetchCurrentUserProfile(token);
      } else {
        setIsPreAuthing(false);
      }
    } catch (e) {
      console.error("Critical failure during mount:", e);
      setIsPreAuthing(false);
    }
  }, [token]);

  // Helper helper to fetch user profile details for out-of-tab visual alerts
  const fetchNotificationDetailsAndAlert = async (type: 'direct' | 'group', senderId: number, text: string) => {
    try {
      const res = await fetch(`/api/users/profile/${senderId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const details = await res.json();
        setIncomingNotification({
          senderName: details.username,
          avatar: details.avatar,
          text: text,
          type: 'direct'
        });
        // Clear auto alert
        setTimeout(() => setIncomingNotification(null), 4500);
      }
    } catch (e) {
      console.error("Popup notice loader fail:", e);
    }
  };

  // Refs to prevent state capture in websocket listeners (prevents reconnect loop)
  const activeTabRef = useRef(activeTab);
  const selectedFriendRef = useRef(selectedFriend);
  const selectedGroupRef = useRef(selectedGroup);
  const chatModeRef = useRef(chatMode);
  const currentUserRef = useRef(currentUser);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { selectedFriendRef.current = selectedFriend; }, [selectedFriend]);
  useEffect(() => { selectedGroupRef.current = selectedGroup; }, [selectedGroup]);
  useEffect(() => { chatModeRef.current = chatMode; }, [chatMode]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Polling fallback when WebSocket is offline or blocked (e.g. by Cloudflare tunnel challenge)
  useEffect(() => {
    if (isWsConnected || !token) return;

    const interval = setInterval(() => {
      try {
        if (chatMode === 'direct' && selectedFriend) {
          loadChatHistories(selectedFriend.id);
        } else if (chatMode === 'group' && selectedGroup) {
          loadGroupHistory(selectedGroup.id);
        }
      } catch (err) {
        console.error("Polling historical sync failed:", err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isWsConnected, selectedFriend, selectedGroup, chatMode, token]);

  // Handle active socket connection setup and lifecycle
  useEffect(() => {
    if (!token || !currentUser) {
      // Disconnect socket if user signs out
      if (socketRef.current) {
        socketRef.current.close();
      }
      return;
    }

    const establishWebSocketConnection = () => {
      try {
        if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
          return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        console.log(`Connecting to Websocket Server on ZNet: ${wsUrl}`);
        
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          try {
            console.log("WebSocket connection established! Sending handshake...");
            reconnectAttemptsRef.current = 0;
            // Send auth handshake
            ws.send(JSON.stringify({ type: 'auth', token }));
          } catch (e) {
            console.error("WebSocket write failed on open event:", e);
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'auth_success': {
                setIsWsConnected(true);
                console.log("WebSocket registration fully authorized!");
                break;
              }

              case 'message_recv': {
                const { id, senderId, text, createdAt } = data;
                appendIncomingMessage(senderId, {
                  id,
                  senderId,
                  receiverId: currentUserRef.current?.id || 0,
                  text,
                  createdAt
                });

                // Trigger gorgeous popup alert overlay if user is browsing other sections
                if (activeTabRef.current !== 'chats' || !selectedFriendRef.current || selectedFriendRef.current.id !== senderId || chatModeRef.current !== 'direct') {
                  fetchNotificationDetailsAndAlert('direct', senderId, text);
                }
                break;
              }

              case 'message_recall_recv': {
                const { id, senderId, receiverId } = data;
                const targetFriendId = senderId === (currentUserRef.current?.id || 0) ? receiverId : senderId;
                setMessagesRegistry((prev) => {
                  const existing = prev[targetFriendId] || [];
                  return {
                    ...prev,
                    [targetFriendId]: existing.map(m => m.id === id ? { ...m, isRecalled: 1, text: 'Tin nhắn đã được thu hồi' } : m)
                  };
                });
                break;
              }

              case 'group_message_recall_recv': {
                const { id, groupId } = data;
                setGroupMessagesRegistry((prev) => {
                  const existing = prev[groupId] || [];
                  return {
                    ...prev,
                    [groupId]: existing.map(m => m.id === id ? { ...m, isRecalled: 1, text: 'Tin nhắn đã được thu hồi' } : m)
                  };
                });
                break;
              }

              case 'group_message_recv': {
                const { id, groupId, senderId, senderName, senderAvatar, text, createdAt } = data;
                appendIncomingGroupMessage(groupId, {
                  id,
                  senderId,
                  text,
                  createdAt,
                  senderName,
                  senderAvatar
                });

                // Trigger gorgeous popup alert notice for incoming secure group messages
                if (activeTabRef.current !== 'chats' || !selectedGroupRef.current || selectedGroupRef.current.id !== groupId || chatModeRef.current !== 'group') {
                  setIncomingNotification({
                    senderName: `${senderName} @ Nhóm`,
                    avatar: senderAvatar || 'https://api.dicebear.com/7.x/pixel-art/svg?seed=group',
                    text: text,
                    type: 'group'
                  });
                  setTimeout(() => setIncomingNotification(null), 4500);
                }
                break;
              }

              case 'message_ack': {
                const { id, receiverId, text, createdAt } = data;
                appendIncomingMessage(receiverId, {
                  id,
                  senderId: currentUserRef.current?.id || 0,
                  receiverId,
                  text,
                  createdAt
                });
                break;
              }

              case 'typing_recv': {
                const { senderId, isTyping } = data;
                setTypingFriends((prev) => {
                  if (isTyping) {
                    if (!prev.includes(senderId)) return [...prev, senderId];
                  } else {
                    return prev.filter((id) => id !== senderId);
                  }
                  return prev;
                });
                break;
              }

              case 'presence_change': {
                const { userId, status } = data;
                setFriendsPresenceState((prev) => ({
                  ...prev,
                  [userId]: status === 'online'
                }));
                break;
              }

              case 'presence_resp': {
                const { presence } = data;
                const statusMapping: { [key: number]: boolean } = {};
                Object.keys(presence).forEach((fIdStr) => {
                  const fId = parseInt(fIdStr);
                  statusMapping[fId] = presence[fId] === 'online';
                });
                setFriendsPresenceState((prev) => ({
                  ...prev,
                  ...statusMapping
                }));
                break;
              }

              case 'auth_failed':
              case 'error': {
                console.warn("WebSocket received error signal from host:", data.error);
                break;
              }

              case 'system_broadcast': {
                setActiveBroadcast(data.text);
                break;
              }

              case 'force_logout': {
                alert(data.message || 'Tài khoản của bạn đã bị quản trị viên đình chỉ hoạt động.');
                handleLogout();
                break;
              }

              default:
                break;
            }
          } catch (messageError) {
            console.error("Parsing inbound WebSocket payload failed:", messageError);
          }
        };

        ws.onclose = () => {
          try {
            setIsWsConnected(false);
            console.log("WebSocket connection interrupted.");
            if (reconnectAttemptsRef.current < 10) {
              reconnectAttemptsRef.current += 1;
              const reconnectDelay = Math.min(2000 * reconnectAttemptsRef.current, 10000);
              console.log(`Scheduling reconnect attempt #${reconnectAttemptsRef.current} in ${reconnectDelay}ms...`);
              
              if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = setTimeout(() => {
                establishWebSocketConnection();
              }, reconnectDelay);
            }
          } catch (err) {
            console.error("Teardown error during connection collapse: ", err);
          }
        };

        ws.onerror = (err) => {
          console.error("WebSocket socket channel reported error: ", err);
        };

      } catch (wsError) {
        console.error("Critical WebSocket establish call failed:", wsError);
      }
    };

    establishWebSocketConnection();

    return () => {
      try {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        if (socketRef.current) {
          socketRef.current.close();
        }
      } catch (e) {
        console.error("Websocket extraction cleaner failed:", e);
      }
    };
  }, [token, currentUser?.id]);

  const appendIncomingMessage = (friendId: number, message: Message) => {
    try {
      setMessagesRegistry((prev) => {
        const existingMessages = prev[friendId] || [];
        // Prevent duplicate appending
        if (existingMessages.some(m => m.id === message.id)) {
          return prev;
        }
        return {
          ...prev,
          [friendId]: [...existingMessages, message]
        };
      });
    } catch (e) {
      console.error("State messaging appender failed:", e);
    }
  };

  const appendIncomingGroupMessage = (groupId: number, message: GroupMessage) => {
    try {
      setGroupMessagesRegistry((prev) => {
        const existing = prev[groupId] || [];
        if (existing.some(m => m.id === message.id)) {
          return prev;
        }
        return {
          ...prev,
          [groupId]: [...existing, message]
        };
      });
    } catch (e) {
      console.error("State group messaging appender failed:", e);
    }
  };

  const loadGroupsList = async () => {
    try {
      if (!token) return;
      const res = await fetch('/api/groups/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroupsList(data || []);
      }
    } catch (err) {
      console.error("Load groups error:", err);
    }
  };

  const togglePinGroup = (groupId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    const nextPinned = pinnedGroupIds.includes(groupId)
      ? pinnedGroupIds.filter(id => id !== groupId)
      : [...pinnedGroupIds, groupId];
    setPinnedGroupIds(nextPinned);
    localStorage.setItem(`znet_pinned_groups_${currentUser.id}`, JSON.stringify(nextPinned));
  };

  const executeLeaveGroup = async (groupId: number) => {
    try {
      setLeavingInProgress(true);
      const res = await fetch(`/api/groups/${groupId}/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        if (selectedGroup?.id === groupId) {
          setSelectedGroup(null);
        }
        await loadGroupsList();
        setGroupToLeave(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Có lỗi xảy ra khi rời nhóm');
      }
    } catch (err) {
      console.error("Leave group failed:", err);
      alert('Không kết nối được với máy chủ');
    } finally {
      setLeavingInProgress(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          name: newGroupName.trim(),
          isPrivate: isNewGroupPrivate ? 1 : 0
        })
      });
      if (res.ok) {
        setNewGroupName('');
        setIsNewGroupPrivate(false);
        loadGroupsList();
      } else {
        const data = await res.json();
        alert(data.error || 'Không thể tạo nhóm');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleJoinGroupByLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupJoinLinkInput.trim()) return;

    // Extract ID from full URL or use ID strictly
    let groupIdStr = groupJoinLinkInput.trim();
    if (groupIdStr.includes('/join-group/')) {
      const parts = groupIdStr.split('/join-group/');
      groupIdStr = parts[parts.length - 1];
    }

    const groupId = parseInt(groupIdStr, 10);
    if (isNaN(groupId)) {
      alert('Đường dẫn nhóm hoặc mã số ID nhóm không hợp lệ.');
      return;
    }

    try {
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ groupId })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Yêu cầu tham gia nhóm đã được xử lý thành công!');
        setGroupJoinLinkInput('');
        loadGroupsList();
      } else {
        alert(data.error || 'Yêu cầu tham gia nhóm thất bại.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // When a chat with a specific friend is selected, pull historical messages first
  const loadChatHistories = async (friendId: number) => {
    try {
      if (!token) return;
      const res = await fetch(`/api/messages/history/${friendId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const listData = await res.json();
        setMessagesRegistry((prev) => ({
          ...prev,
          [friendId]: listData
        }));
      }
    } catch (error) {
      console.error("Load conversation history failed:", error);
    }
  };

  const loadGroupHistory = async (groupId: number) => {
    try {
      if (!token) return;
      const res = await fetch(`/api/groups/${groupId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const listData = await res.json();
        setGroupMessagesRegistry(prev => ({
          ...prev,
          [groupId]: listData
        }));
      }
    } catch (e) {
      console.error("Load group messages failed:", e);
    }
  };

  const handleRecallMessage = async (messageId: number, friendId: number) => {
    try {
      const res = await fetch(`/api/messages/recall/${messageId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setMessagesRegistry((prev) => {
          const existing = prev[friendId] || [];
          return {
            ...prev,
            [friendId]: existing.map(m => m.id === messageId ? { ...m, isRecalled: 1, text: 'Tin nhắn đã được thu hồi' } : m)
          };
        });
      } else {
        const data = await res.json();
        alert(data.error || 'Không thể thu hồi tin nhắn');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteMessageSide = async (messageId: number, friendId: number) => {
    try {
      const res = await fetch(`/api/messages/delete-side/${messageId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setMessagesRegistry((prev) => {
          const existing = prev[friendId] || [];
          return {
            ...prev,
            [friendId]: existing.filter(m => m.id !== messageId)
          };
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRecallGroupMessage = async (messageId: number, groupId: number) => {
    try {
      const res = await fetch(`/api/groups/messages/recall/${messageId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setGroupMessagesRegistry((prev) => {
          const existing = prev[groupId] || [];
          return {
            ...prev,
            [groupId]: existing.map(m => m.id === messageId ? { ...m, isRecalled: 1, text: 'Tin nhắn đã được thu hồi' } : m)
          };
        });
      } else {
        const data = await res.json();
        alert(data.error || 'Không thể thu hồi tin nhắn nhóm');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteGroupMessageSide = async (messageId: number, groupId: number) => {
    try {
      const res = await fetch(`/api/groups/messages/delete-side/${messageId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setGroupMessagesRegistry((prev) => {
          const existing = prev[groupId] || [];
          return {
            ...prev,
            [groupId]: existing.filter(m => m.id !== messageId)
          };
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Selects friend layout and pulls stories
  const handleSelectFriend = (friend: Friend) => {
    try {
      setSelectedFriend(friend);
      loadChatHistories(friend.id);
      setActiveTab('chats');
    } catch (error) {
      console.error("Selection failed:", error);
    }
  };

  const handleSelectGroup = (group: ChatGroup) => {
    setSelectedGroup(group);
    loadGroupHistory(group.id);
    setActiveTab('chats');
  };

  // Triggers WebSockets payload to send custom text with HTTP API fallback
  const handleSendMessage = async (text: string) => {
    try {
      if (!text.trim() || !selectedFriend) return;
      const trimmedText = text.trim();

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const messagePayload = JSON.stringify({
          type: 'message',
          receiverId: selectedFriend.id,
          text: trimmedText
        });
        socketRef.current.send(messagePayload);
      } else {
        // Fallback to HTTP POST
        const res = await fetch('/api/messages/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            receiverId: selectedFriend.id,
            text: trimmedText
          })
        });
        if (res.ok) {
          const newMsg = await res.json();
          setMessagesRegistry((prev) => {
            const existing = prev[selectedFriend.id] || [];
            if (existing.some(m => m.id === newMsg.id)) return prev;
            return {
              ...prev,
              [selectedFriend.id]: [...existing, newMsg]
            };
          });
        } else {
          console.error("HTTP fallback message send failed.");
        }
      }
    } catch (err) {
      console.error("Socket/HTTP message emit failed:", err);
    }
  };

  const handleSendGroupMessage = async (text: string) => {
    try {
      if (!text.trim() || !selectedGroup) return;
      const trimmedText = text.trim();

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'group_message',
          groupId: selectedGroup.id,
          text: trimmedText
        }));
      } else {
        // Fallback to HTTP POST
        const res = await fetch('/api/groups/messages/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            groupId: selectedGroup.id,
            text: trimmedText
          })
        });
        if (res.ok) {
          const newMsg = await res.json();
          setGroupMessagesRegistry((prev) => {
            const existing = prev[selectedGroup.id] || [];
            if (existing.some(m => m.id === newMsg.id)) return prev;
            return {
              ...prev,
              [selectedGroup.id]: [...existing, newMsg]
            };
          });
        } else {
          console.error("HTTP fallback group message send failed.");
        }
      }
    } catch (err) {
      console.error("Socket/HTTP send group message error:", err);
    }
  };

  // Emit current user typing status to active friend
  const handleSendTypingState = (isTyping: boolean) => {
    try {
      if (!selectedFriend || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      const typingPayload = JSON.stringify({
        type: 'typing',
        receiverId: selectedFriend.id,
        isTyping
      });
      socketRef.current.send(typingPayload);
    } catch (err) {
      console.error("Socket typing emit failed:", err);
    }
  };

  const handleAuthenticationSuccess = (sessionToken: string, sessionUser: User) => {
    try {
      localStorage.setItem('znet_auth_token', sessionToken);
      setToken(sessionToken);
      setCurrentUser(sessionUser);
    } catch (e) {
      console.error("Local storage allocation failed:", e);
    }
  };

  const handleProfileModified = (updatedFields: Partial<User>) => {
    try {
      if (currentUser) {
        setCurrentUser({
          ...currentUser,
          ...updatedFields
        });
      }
    } catch (error) {
      console.error("Status modify failed:", error);
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('znet_auth_token');
      // Truncate state
      setToken(null);
      setCurrentUser(null);
      setSelectedFriend(null);
      setSelectedGroup(null);
      setMessagesRegistry({});
      setGroupMessagesRegistry({});
      setIsWsConnected(false);
      if (socketRef.current) {
        socketRef.current.close();
      }
    } catch (e) {
      console.error("Logout execution failed:", e);
    }
  };

  // Run presence queries once connected to socket and select list loaded
  useEffect(() => {
    try {
      if (isWsConnected && socketRef.current && selectedFriend) {
        socketRef.current.send(JSON.stringify({
          type: 'presence_query',
          friendIds: [selectedFriend.id]
        }));
      }
    } catch (e) {
      console.error("Presence query failed:", e);
    }
  }, [isWsConnected, interstateSelectedFriendIdDependencyHelper()]);

  function interstateSelectedFriendIdDependencyHelper() {
    return selectedFriend ? selectedFriend.id : null;
  }

  // Pre-load groups initially
  useEffect(() => {
    if (token) {
      loadGroupsList();
    }
  }, [token]);

  const themeClass = 
    appTheme === 'mono-dark' ? 'theme-mono-dark' : 
    appTheme === 'mono-light' ? 'theme-mono-light' : 
    '';

  if (isPreAuthing) {
    return (
      <div className={`min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center animate-fade-in ${themeClass}`}>
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
        <h3 className="text-white text-base font-bold font-sans">Đang đồng bộ mạng lưới ZNet...</h3>
        <p className="text-xs text-slate-550 mt-1.5">Vui lòng đợi giây lát trong lúc hệ thống nạp phiên đăng nhập an toàn.</p>
      </div>
    );
  }

  // Not logged in -> Auth viewport
  if (!token || !currentUser) {
    return (
      <div className={`min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 ${themeClass}`}>
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6" id="welcome_logo_shield">
          <div className="inline-flex gap-2.5 items-center font-sans tracking-tighter text-white text-4xl mb-4 font-black">
            <span className="p-2.5 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0">
              <Zap className="w-8 h-8 fill-white/10" />
            </span>
            <span>ZNet</span>
          </div>
          <p className="text-indigo-400 text-xs font-semibold tracking-wider uppercase mb-1 flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Xác thực và 2FA đáng tin cậy
          </p>
        </div>
        <AuthForm onAuthSuccess={handleAuthenticationSuccess} />
      </div>
    );
  }

  // Logged in -> Secure Split Main Dashboard viewport
  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none ${themeClass}`} id="znet_dashboard_viewport">
      
      {/* Floating dynamic alert notifications */}
      {incomingNotification && (
        <div 
          onClick={() => {
            setActiveTab('chats');
            setChatMode(incomingNotification.type);
            setIncomingNotification(null);
          }}
          className="fixed top-16 right-6 z-50 bg-slate-900 border border-indigo-500/30 p-4 rounded-2xl shadow-xl flex items-center gap-3 max-w-sm cursor-pointer hover:border-indigo-500 hover:scale-102 transition duration-200 animate-slide-in"
          id="realtime_message_popup_notification"
        >
          <img referrerPolicy="no-referrer" src={incomingNotification.avatar} alt="Sender Avatar" className="w-9 h-9 rounded-xl object-cover border border-slate-850 shrink-0" />
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-black text-indigo-400 truncate mb-1">{incomingNotification.senderName}</h4>
            <p className="text-[11px] text-slate-200 truncate leading-none">{incomingNotification.text}</p>
          </div>
          <span className="text-[8px] uppercase tracking-widest font-extrabold px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 rounded-md shrink-0">MỚI</span>
        </div>
      )}

      {/* Dynamic Network Status Banner */}
      <div className="bg-slate-900 border-b border-slate-850 px-5 py-2.5 flex items-center justify-between text-xs shrink-0" id="network_status_indicator">
        <div className="flex items-center gap-2">
          <span className="p-1 px-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg font-bold text-[9px] uppercase tracking-wider">Phiên làm việc</span>
          <span className="text-slate-400 font-medium">Chào mừng trở lại, <b className="text-indigo-400 font-semibold">{currentUser.username}</b></span>
          {currentUser.role === 'admin' && (
            <span className="p-0.5 px-2 bg-rose-500/10 text-rose-450 border border-rose-500/20 rounded-lg font-extrabold text-[8px] uppercase tracking-widest animate-pulse">ADMIN</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-slate-350 font-bold text-[10px] uppercase tracking-wider">
              {isWsConnected ? 'Mạng lưới Hoạt động' : 'Đang tìm kiếm kết nối...'}
            </span>
          </div>
          
          <span className="text-slate-500">|</span>

          {/* Theme Quick Switcher */}
          <div className="flex items-center gap-1 bg-slate-950/40 rounded-xl p-0.5 border border-slate-800 shrink-0">
            <button
              onClick={() => changeAppTheme('cosmic')}
              className={`p-1 px-2 rounded-lg text-[9px] font-bold uppercase transition cursor-pointer leading-none ${appTheme === 'cosmic' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              title="Giao diện Tinh Vân (Mặc định)"
            >
              Tinh Vân
            </button>
            <button
              onClick={() => changeAppTheme('mono-dark')}
              className={`p-1 px-1.5 rounded-lg text-[9px] font-bold uppercase transition cursor-pointer leading-none ${appTheme === 'mono-dark' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              title="Giao diện Trắng Đen (Tối)"
            >
              Đen
            </button>
            <button
              onClick={() => changeAppTheme('mono-light')}
              className={`p-1 px-1.5 rounded-lg text-[9px] font-bold uppercase transition cursor-pointer leading-none ${appTheme === 'mono-light' ? 'bg-slate-300 text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}
              title="Giao diện Trắng Đen (Sáng)"
            >
              Trắng
            </button>
          </div>
          
          <span className="text-slate-500">|</span>
          
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-slate-400 hover:text-rose-455 transition text-[10px] font-semibold uppercase tracking-wider cursor-pointer"
            title="Đăng xuất hoàn toàn"
          >
            <LogOut className="w-3.5 h-3.5" /> Thoát
          </button>
        </div>
      </div>

      {activeBroadcast && (
        <div className="bg-gradient-to-r from-rose-950/40 via-red-900/20 to-slate-900 border-b border-rose-500/30 text-rose-300 px-5 py-3 text-xs flex justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="animate-ping w-2 h-2 rounded-full bg-rose-500 shrink-0 inline-block" />
            <span className="font-extrabold uppercase text-[10px] tracking-widest text-red-400">[THÔNG BÁO TỪ QUẢN TRỊ]:</span>
            <span className="font-medium text-slate-100">{activeBroadcast}</span>
          </div>
          <button 
            onClick={() => setActiveBroadcast(null)} 
            className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-md transition"
          >
            Ẩn ✕
          </button>
        </div>
      )}

      {/* Main Container Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-hidden">
        
        {/* Navigation Sidebar panel (1 column) */}
        <div className="lg:col-span-1 flex flex-col h-full bg-slate-900 border border-slate-800 rounded-3xl p-5 justify-between shrink-0" id="znet_navigation_panel">
          
          {/* Logo and metadata info */}
          <div className="space-y-6">
            <div className="flex items-center gap-2.5 border-b border-slate-850/80 pb-4">
              <span className="p-2 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-500/10 shrink-0">
                <Zap className="w-5 h-5 fill-white/10" />
              </span>
              <div>
                <h2 className="text-lg font-bold font-sans tracking-tight text-white leading-none">ZNet Social</h2>
                <span className="text-[9px] text-slate-500 mt-1 block">Hệ thống Real-time mượt mà</span>
              </div>
            </div>

            {/* Sidebar quick profile card */}
            <div className="p-3.5 bg-slate-950/40 border border-slate-850 rounded-2xl flex items-center gap-3">
              <img referrerPolicy="no-referrer" src={currentUser.avatar} alt="Avatar self" className="w-9 h-9 rounded-xl object-cover shrink-0 border border-slate-800" />
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white truncate leading-none mb-1.5">{currentUser.username}</h4>
                <p className="text-[10px] text-slate-405 truncate leading-none">{currentUser.status}</p>
              </div>
            </div>

            {/* Nav Selection bar */}
            <div className="space-y-2">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block px-2">Menu chính</span>
              
              <button
                onClick={() => setActiveTab('timeline')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition cursor-pointer ${
                  activeTab === 'timeline'
                    ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/40 border border-transparent'
                }`}
                id="navbar_tab_timeline"
              >
                <Rss className="w-4 h-4" /> Vòng thời gian
              </button>

              <button
                onClick={() => {
                  setActiveTab('chats');
                  loadGroupsList();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition cursor-pointer ${
                  activeTab === 'chats'
                    ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/40 border border-transparent'
                }`}
                id="navbar_tab_chats"
              >
                <MessageSquare className="w-4 h-4" /> Trò chuyện
              </button>

              <button
                onClick={() => setActiveTab('friends')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition cursor-pointer ${
                  activeTab === 'friends'
                    ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/40 border border-transparent'
                }`}
                id="navbar_tab_friends"
              >
                <Users className="w-4 h-4" /> Kết bạn ZNet
              </button>

              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition cursor-pointer ${
                  activeTab === 'profile'
                    ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/40 border border-transparent'
                }`}
                id="navbar_tab_profile"
              >
                <UserIcon className="w-4 h-4" /> Bảo mật & Cá nhân
              </button>

              <button
                onClick={() => setActiveTab('export_docs')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition cursor-pointer ${
                  activeTab === 'export_docs'
                    ? 'text-emerald-450 bg-emerald-500/10 border border-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/40 border border-transparent'
                }`}
                id="navbar_tab_export_docs"
              >
                <FileText className="w-4 h-4" /> Sao lưu Google Docs
              </button>

              {currentUser.role === 'admin' && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition cursor-pointer ${
                    activeTab === 'admin'
                      ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/40 border border-transparent'
                  }`}
                  id="navbar_tab_admin"
                >
                  <Activity className="w-4 h-4 text-rose-400" /> Điều hành Admin
                </button>
              )}
            </div>
          </div>

          {/* Giao diện Trắng Đen Selector block */}
          <div className="p-3.5 bg-slate-950/20 border border-slate-850 rounded-2xl space-y-2 mt-4 shrink-0" id="sidebar_theme_selector_block">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block px-1">Chủ đề & Giao diện</span>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => changeAppTheme('cosmic')}
                className={`py-1.5 px-0.5 rounded-lg text-[9px] font-extrabold transition cursor-pointer text-center leading-none ${
                  appTheme === 'cosmic'
                    ? 'bg-indigo-600/15 border border-indigo-500/20 text-indigo-400'
                    : 'bg-slate-950/40 border border-slate-850 text-slate-500 hover:text-slate-300'
                }`}
              >
                Tinh Vân
              </button>
              <button
                onClick={() => changeAppTheme('mono-dark')}
                className={`py-1.5 px-0.5 rounded-lg text-[9px] font-extrabold transition cursor-pointer text-center leading-none ${
                  appTheme === 'mono-dark'
                    ? 'bg-slate-800 border border-slate-700 text-white'
                    : 'bg-slate-950/40 border border-slate-850 text-slate-500 hover:text-slate-300'
                }`}
              >
                B&W Tối
              </button>
              <button
                onClick={() => changeAppTheme('mono-light')}
                className={`py-1.5 px-0.5 rounded-lg text-[9px] font-extrabold transition cursor-pointer text-center leading-none ${
                  appTheme === 'mono-light'
                    ? 'bg-slate-200 border border-slate-300 text-slate-950 font-black'
                    : 'bg-slate-950/40 border border-slate-850 text-slate-500 hover:text-slate-300'
                }`}
              >
                B&W Sáng
              </button>
            </div>
          </div>

          {/* Bottom security assurance panel */}
          <div className="border-t border-slate-850/80 pt-4 text-center mt-6">
            <div className="flex items-center justify-center gap-1.5 text-slate-500 mb-1">
              <Check className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[10px] font-bold text-slate-440 uppercase tracking-wider">Hệ thống Zero-Crash</span>
            </div>
            <p className="text-[9px] text-slate-500 leading-snug">Vận hành siêu ổn định trên SQLite & Node engine</p>
          </div>

        </div>

        {/* View components container (3 columns) */}
        <div className="lg:col-span-3 h-[750px] flex flex-col text-slate-100 overflow-hidden" id="znet_route_display">
          
          {activeTab === 'timeline' && (
            <FeedSection token={token} user={currentUser} onViewProfile={(uid) => setProfileUserId(uid)} />
          )}

          {activeTab === 'chats' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full" id="chats_layout_subgrid">
              
              {/* Chats List sidebar block */}
              <div className="md:col-span-1 h-full overflow-hidden flex flex-col">
                {/* Chat sub tabs style */}
                <div className="flex gap-2 mb-3 bg-slate-950/40 p-1 rounded-xl border border-slate-850 shrink-0">
                  <button
                    onClick={() => setChatMode('direct')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer ${
                      chatMode === 'direct' ? 'bg-indigo-605 bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Cá nhân
                  </button>
                  <button
                    onClick={() => {
                      setChatMode('group');
                      loadGroupsList();
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer ${
                      chatMode === 'group' ? 'bg-indigo-605 bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Nhóm chat
                  </button>
                </div>

                {chatMode === 'direct' ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <FriendsList
                      token={token}
                      currentUserId={currentUser.id}
                      selectedFriendId={selectedFriend ? selectedFriend.id : null}
                      onSelectFriend={(friend) => {
                        const modifiedFriend = {
                          ...friend,
                          isOnline: !!friendsPresenceState[friend.id]
                        };
                        handleSelectFriend(modifiedFriend);
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-3xl p-4 overflow-hidden">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-3 pl-1">Nhóm chat của bạn</span>

                    {/* Group creation quick form */}
                    <form onSubmit={handleCreateGroup} className="space-y-2 mb-3 shrink-0">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Tên nhóm mới..."
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          required
                          className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-3.5 py-1.5 flex items-center justify-center font-bold text-xs cursor-pointer shrink-0"
                          title="Tạo nhóm chat mới"
                        >
                          Tạo
                        </button>
                      </div>

                      {/* Flag isPrivate select toggle checkbox */}
                      <label className="flex items-center gap-1.5 cursor-pointer select-none px-1">
                        <input
                          type="checkbox"
                          checked={isNewGroupPrivate}
                          onChange={(e) => setIsNewGroupPrivate(e.target.checked)}
                          className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0"
                        />
                        <span className="text-[9px] font-semibold text-slate-400 hover:text-slate-350">
                          Nhóm riêng tư (Yêu cầu phê duyệt tham gia)
                        </span>
                      </label>
                    </form>

                    {/* Join Group with index or link form */}
                    <form onSubmit={handleJoinGroupByLink} className="flex gap-2 mb-4 shrink-0 border-t border-slate-800/60 pt-3">
                      <input
                        type="text"
                        placeholder="Dán link hoặc nhập mã ID nhóm..."
                        value={groupJoinLinkInput}
                        onChange={(e) => setGroupJoinLinkInput(e.target.value)}
                        required
                        className="flex-1 bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-3 py-1.5 flex items-center justify-center font-bold text-xs cursor-pointer shrink-0"
                        title="Gửi yêu cầu tham gia nhóm"
                      >
                        Vào nhóm
                      </button>
                    </form>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                      {groupsList.length === 0 ? (
                        <p className="text-[10px] text-slate-555 text-center py-6 italic">Bạn chưa gia nhập nhóm chat nào.</p>
                      ) : (
                        [...groupsList]
                          .sort((a, b) => {
                            const aPinned = pinnedGroupIds.includes(a.id);
                            const bPinned = pinnedGroupIds.includes(b.id);
                            if (aPinned && !bPinned) return -1;
                            if (!aPinned && bPinned) return 1;
                            return 0;
                          })
                          .map(g => {
                            const isSelected = selectedGroup?.id === g.id;
                            const isPinned = pinnedGroupIds.includes(g.id);
                            return (
                              <div
                                key={g.id}
                                onClick={() => handleSelectGroup(g)}
                                className={`p-3 rounded-2xl border transition cursor-pointer flex justify-between items-center group relative ${
                                  isSelected 
                                    ? 'bg-indigo-500/10 border-indigo-500/35 text-indigo-400' 
                                    : 'bg-slate-950/20 border-slate-850 text-slate-300 hover:border-slate-750'
                                }`}
                              >
                                <div className="min-w-0 pr-2 flex-1">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <h4 className="text-xs font-bold truncate text-white leading-none">{g.name}</h4>
                                    {isPinned && (
                                      <span className="inline-flex items-center gap-0.5 p-0.5 px-1 bg-amber-500/10 text-amber-400 rounded-md border border-amber-500/20 text-[8px] font-bold uppercase shrink-0">
                                        <Pin className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                        Ghim
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-slate-500 block leading-none">Mã #{g.id} • {g.membersCount} thành viên</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={(e) => togglePinGroup(g.id, e)}
                                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                      isPinned
                                        ? 'bg-amber-550/15 border-amber-500/30 text-amber-400 hover:bg-amber-550/25'
                                        : 'bg-slate-950/40 border-slate-850 text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                    }`}
                                    title={isPinned ? "Bỏ ghim nhóm" : "Ghim nhóm lên vị trí đầu"}
                                    id={`pin_group_btn_${g.id}`}
                                  >
                                    <Pin className={`w-3 h-3 ${isPinned ? 'fill-amber-400 text-amber-400' : ''}`} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setGroupToLeave(g);
                                    }}
                                    className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition cursor-pointer"
                                    title="Rời khỏi nhóm"
                                    id={`leave_group_btn_${g.id}`}
                                  >
                                    <LogOut className="w-3 h-3" />
                                  </button>
                                  <span className="text-[9px] bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 text-slate-400 font-medium whitespace-nowrap">Nhóm</span>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Viewport container */}
              <div className="md:col-span-2 h-full overflow-hidden flex flex-col">
                {chatMode === 'direct' ? (
                  selectedFriend ? (
                    <ChatWindow
                      friend={{
                        ...selectedFriend,
                        isOnline: !!friendsPresenceState[selectedFriend.id]
                      }}
                      messages={messagesRegistry[selectedFriend.id] || []}
                      currentUserId={currentUser.id}
                      onSendMessage={handleSendMessage}
                      isFriendTyping={typingFriends.includes(selectedFriend.id)}
                      onSendTypingState={handleSendTypingState}
                      onRecallMessage={handleRecallMessage}
                      onDeleteMessageSide={handleDeleteMessageSide}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center bg-slate-900 border border-slate-800 rounded-3xl h-full p-8 text-center bg-slate-950/20">
                      <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/15 mb-4 animate-bounce">
                        <MessageSquare className="w-8 h-8" />
                      </div>
                      <h3 className="text-white text-sm font-bold font-sans">Tin Nhắn Mã Hóa Đầu Cuối</h3>
                      <p className="text-[10px] text-slate-550 mt-1 max-w-xs leading-relaxed font-sans">
                        Hãy chọn một liên hệ bạn bè kết nối sẵn bên trái hoặc chuyển sang tab nhóm chat để đàm thoại tức thì.
                      </p>
                    </div>
                  )
                ) : (
                  selectedGroup ? (
                    <GroupChatWindow
                      group={selectedGroup}
                      messages={groupMessagesRegistry[selectedGroup.id] || []}
                      currentUserId={currentUser.id}
                      onSendGroupMessage={handleSendGroupMessage}
                      token={token}
                      onRecallGroupMessage={handleRecallGroupMessage}
                      onDeleteGroupMessageSide={handleDeleteGroupMessageSide}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center bg-slate-900 border border-slate-800 rounded-3xl h-full p-8 text-center bg-slate-950/20">
                      <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/15 mb-4">
                        <Users className="w-8 h-8" />
                      </div>
                      <h3 className="text-white text-sm font-bold font-sans">Nhóm Chat Tập Thể</h3>
                      <p className="text-[10px] text-slate-550 mt-1 max-w-xs leading-relaxed font-sans">
                        Hãy tạo một cuộc trò chuyện nhóm mới hoặc chọn một nhóm chat hiện hữu ở khung bên trái để thảo luận tức thì.
                      </p>
                    </div>
                  )
                )}
              </div>

            </div>
          )}

          {activeTab === 'friends' && (
            <div className="h-full overflow-hidden">
              <FriendsList
                token={token}
                currentUserId={currentUser.id}
                selectedFriendId={selectedFriend ? selectedFriend.id : null}
                onSelectFriend={(friend) => {
                  const mFriend = {
                    ...friend,
                    isOnline: !!friendsPresenceState[friend.id]
                  };
                  handleSelectFriend(mFriend);
                }}
              />
            </div>
          )}

          {activeTab === 'profile' && (
            <UserProfile
              token={token}
              user={currentUser}
              onProfileUpdate={handleProfileModified}
              onLogout={handleLogout}
            />
          )}

          {activeTab === 'admin' && (
            <AdminConsole token={token} />
          )}

          {activeTab === 'export_docs' && (
            <ExportDocsSection token={token!} user={currentUser} />
          )}

        </div>

      </div>

      {/* Global interactive User Profile Drawer Card */}
      {profileUserId !== null && (
        <UserProfileModal
          token={token!}
          userId={profileUserId}
          currentUserId={currentUser.id}
          onClose={() => setProfileUserId(null)}
          onStartChat={(friend) => {
            setChatMode('direct');
            handleSelectFriend(friend);
          }}
        />
      )}

      {/* Leave Group Confirmation Modal */}
      {groupToLeave !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in" id="leave_group_confirm_modal">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400 mb-4 animate-bounce">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="text-white font-bold text-base mb-2 font-sans">Xác nhận rời nhóm?</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Bạn có chắc chắn muốn rời khỏi nhóm <span className="text-white font-semibold">"{groupToLeave.name}"</span> không? Hành động này không thể hoàn tác nếu đây là nhóm riêng tư trừ khi bạn được mời lại.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setGroupToLeave(null)}
                className="px-4 py-2 bg-slate-950/40 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/80 rounded-xl transition text-xs font-semibold cursor-pointer"
                disabled={leavingInProgress}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => executeLeaveGroup(groupToLeave.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white rounded-xl transition text-xs font-bold cursor-pointer flex items-center gap-1.5"
                disabled={leavingInProgress}
                id="confirm_leave_group_btn"
              >
                {leavingInProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Đang rời...
                  </>
                ) : 'Xác nhận rời'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
