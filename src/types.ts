/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: number;
  username: string;
  avatar: string;
  status: string;
  twoFactorEnabled: boolean;
  role?: string;
}

export interface Friend {
  id: number;
  username: string;
  avatar: string;
  status: string;
  relation?: string; // 'pending' | 'accepted'
  relationship_status?: string | null;
  request_initiator?: number | null;
  isOnline?: boolean;
}

export interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  text: string;
  createdAt: string;
  readStatus?: number;
  isRecalled?: number;
  deletedBySender?: number;
  deletedByReceiver?: number;
}

export interface FeedPost {
  id: number;
  content: string;
  likesCount: number;
  createdAt: string;
  username: string;
  avatar: string;
  userId: number;
  hasLiked?: boolean | number;
  commentsCount?: number;
}

export interface Comment {
  id: number;
  content: string;
  createdAt: string;
  userId: number;
  username: string;
  avatar: string;
}

export interface ChatGroup {
  id: number;
  name: string;
  createdAt: string;
  membersCount: number;
  isPrivate?: number;
  creatorId?: number;
}

export interface GroupMessage {
  id: number;
  senderId: number;
  text: string;
  createdAt: string;
  senderName: string;
  senderAvatar: string;
  isRecalled?: number;
  deletedByUsers?: string;
}
