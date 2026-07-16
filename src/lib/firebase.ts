import { initializeApp, getApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  enableIndexedDbPersistence 
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase safely
let app;
try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
} catch (error) {
  console.error("Firebase App initialization failed:", error);
}

export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();

// Offline capability setup (indexedDB persistence)
if (db) {
  try {
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab at a time.
        console.warn("Firebase persistence failed-precondition (multiple tabs open)");
      } else if (err.code === 'unimplemented') {
        // The current browser does not support all of the features required to enable persistence
        console.warn("Firebase persistence is unimplemented in this browser");
      }
    });
  } catch (err) {
    console.error("Failed to enable Firebase persistence:", err);
  }
}

export interface FirebaseSyncStats {
  messagesCount: number;
  feedsCount: number;
  groupsCount: number;
  usersCount: number;
  lastSyncedAt: string | null;
}

// Sync Helpers
export async function syncUserToFirebase(user: { id: number; username: string; avatar?: string; status?: string }) {
  if (!db) return;
  try {
    const userDocRef = doc(db, "users", String(user.id));
    await setDoc(userDocRef, {
      id: user.id,
      username: user.username,
      avatar: user.avatar || "",
      status: user.status || "Hi there!",
      syncedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error("Failed to sync user to Firebase:", err);
  }
}

export async function syncMessageToFirebase(msg: {
  id: number;
  senderId: number;
  receiverId: number;
  text: string;
  createdAt: string;
  isRecalled?: number;
}) {
  if (!db) return;
  try {
    const msgDocRef = doc(db, "messages", String(msg.id));
    await setDoc(msgDocRef, {
      id: msg.id,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      text: msg.text,
      createdAt: msg.createdAt,
      isRecalled: msg.isRecalled || 0,
      syncedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error("Failed to sync message to Firebase:", err);
  }
}

export async function syncFeedPostToFirebase(post: {
  id: number;
  content: string;
  likesCount: number;
  createdAt: string;
  username: string;
  avatar: string;
  userId: number;
}) {
  if (!db) return;
  try {
    const postDocRef = doc(db, "feeds", String(post.id));
    await setDoc(postDocRef, {
      id: post.id,
      content: post.content,
      likesCount: post.likesCount,
      createdAt: post.createdAt,
      username: post.username,
      avatar: post.avatar,
      userId: post.userId,
      syncedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error("Failed to sync feed to Firebase:", err);
  }
}

export async function syncGroupMessageToFirebase(groupId: number, msg: {
  id: number;
  senderId: number;
  text: string;
  createdAt: string;
  senderName: string;
  senderAvatar: string;
  isRecalled?: number;
}) {
  if (!db) return;
  try {
    const msgDocRef = doc(db, `groups/${groupId}/messages`, String(msg.id));
    await setDoc(msgDocRef, {
      id: msg.id,
      senderId: msg.senderId,
      text: msg.text,
      createdAt: msg.createdAt,
      senderName: msg.senderName,
      senderAvatar: msg.senderAvatar,
      isRecalled: msg.isRecalled || 0,
      syncedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error("Failed to sync group message to Firebase:", err);
  }
}

export async function syncGroupToFirebase(group: {
  id: number;
  name: string;
  createdAt: string;
  membersCount: number;
  isPrivate?: number;
  creatorId?: number;
}) {
  if (!db) return;
  try {
    const groupDocRef = doc(db, "groups", String(group.id));
    await setDoc(groupDocRef, {
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      membersCount: group.membersCount,
      isPrivate: group.isPrivate || 0,
      creatorId: group.creatorId || 0,
      syncedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error("Failed to sync group to Firebase:", err);
  }
}
