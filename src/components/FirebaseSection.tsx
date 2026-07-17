import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  Database, 
  CheckCircle, 
  RefreshCw, 
  AlertCircle, 
  Info, 
  ShieldCheck, 
  Activity, 
  Users, 
  MessageSquare, 
  Rss, 
  Layers, 
  Play, 
  Check, 
  Flame
} from 'lucide-react';
import { db, firebaseConfig, syncUserToFirebase, syncMessageToFirebase, syncFeedPostToFirebase, syncGroupToFirebase, syncGroupMessageToFirebase } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { apiFetch as fetch } from '../lib/api';

interface FirebaseSectionProps {
  token: string;
}

export default function FirebaseSection({ token }: FirebaseSectionProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncProgress, setSyncProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  
  // Real-time Cloud Stats
  const [firebaseStats, setFirebaseStats] = useState({
    users: 0,
    messages: 0,
    feeds: 0,
    groups: 0,
    loading: false
  });

  const addLog = (msg: string) => {
    setSyncLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  // Fetch Firestore Stats
  const fetchCloudStats = async () => {
    if (!db) {
      addLog("Lỗi: Firebase Firestore chưa được khởi tạo!");
      return;
    }
    try {
      setFirebaseStats(prev => ({ ...prev, loading: true }));
      addLog("Đang truy vấn số liệu trực tiếp từ Firebase Firestore Cloud...");
      
      const collections = ['users', 'messages', 'feeds', 'groups'];
      const counts: Record<string, number> = {};

      for (const col of collections) {
        try {
          const snapshot = await getDocs(collection(db, col));
          counts[col] = snapshot.size;
        } catch (colErr) {
          console.warn(`Failed to count collection ${col}:`, colErr);
          counts[col] = 0;
        }
      }

      setFirebaseStats({
        users: counts['users'] || 0,
        messages: counts['messages'] || 0,
        feeds: counts['feeds'] || 0,
        groups: counts['groups'] || 0,
        loading: false
      });
      
      addLog("Tải số liệu đồng bộ Firebase thành công!");
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Không thể đọc trạng thái từ Firestore Cloud. Vui lòng kiểm tra kết nối mạng.");
      setFirebaseStats(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchCloudStats();
  }, []);

  // Sync entire local sqlite data to Firebase
  const handleFullSync = async () => {
    if (!db) {
      setErrorMsg("Firebase Firestore chưa được định cấu hình chính xác!");
      return;
    }
    
    try {
      setIsSyncing(true);
      setErrorMsg('');
      setSuccessMsg('');
      setSyncProgress(0);
      setSyncLogs([]);
      
      addLog("🚀 Khởi chạy quá trình Đồng bộ hóa Toàn diện sang Firebase Cloud...");
      addLog("Đang tải dữ liệu SQLite từ Express server...");

      const res = await fetch('/api/firebase/sync-data', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error("Không thể tải dữ liệu SQLite từ server");
      }

      const rawData = await res.json();
      const { users = [], feeds = [], messages = [], groups = [], groupMessages = [] } = rawData;

      addLog(`Đã tải thành công: ${users.length} Users, ${feeds.length} Feeds, ${messages.length} Messages, ${groups.length} Groups, ${groupMessages.length} Group Messages.`);

      const totalItems = users.length + feeds.length + messages.length + groups.length + groupMessages.length;
      if (totalItems === 0) {
        setSyncProgress(100);
        setSuccessMsg("Cơ sở dữ liệu SQLite hiện tại trống. Không có gì để đồng bộ!");
        setIsSyncing(false);
        return;
      }

      let processedCount = 0;

      // 1. Sync Users
      addLog("Đang đồng bộ hóa Danh sách Người dùng...");
      for (const u of users) {
        await syncUserToFirebase(u);
        processedCount++;
        setSyncProgress(Math.floor((processedCount / totalItems) * 100));
      }
      addLog("✓ Đã đồng bộ xong dữ liệu người dùng.");

      // 2. Sync Groups
      addLog("Đang đồng bộ hóa Nhóm Trò Chuyện...");
      for (const g of groups) {
        await syncGroupToFirebase(g);
        processedCount++;
        setSyncProgress(Math.floor((processedCount / totalItems) * 100));
      }
      addLog("✓ Đã đồng bộ xong danh sách nhóm chat.");

      // 3. Sync Feeds
      addLog("Đang đồng bộ hóa Vòng thời gian (Feeds & Posts)...");
      for (const f of feeds) {
        await syncFeedPostToFirebase(f);
        processedCount++;
        setSyncProgress(Math.floor((processedCount / totalItems) * 100));
      }
      addLog("✓ Đã đồng bộ xong dữ liệu Feeds.");

      // 4. Sync Messages
      addLog("Đang đồng bộ hóa Tin nhắn Cá nhân (DMs)...");
      for (const m of messages) {
        await syncMessageToFirebase(m);
        processedCount++;
        setSyncProgress(Math.floor((processedCount / totalItems) * 100));
      }
      addLog("✓ Đã đồng bộ xong tin nhắn cá nhân.");

      // 5. Sync Group Messages
      addLog("Đang đồng bộ hóa Lịch sử Tin nhắn Nhóm...");
      for (const gm of groupMessages) {
        await syncGroupMessageToFirebase(gm.groupId, gm);
        processedCount++;
        setSyncProgress(Math.floor((processedCount / totalItems) * 100));
      }
      addLog("✓ Đã đồng bộ xong tin nhắn nhóm.");

      setSyncProgress(100);
      setSuccessMsg(`Chúc mừng! Đã đồng bộ hóa thành công toàn bộ ${totalItems} bản ghi SQLite lên Firebase Firestore Cloud.`);
      addLog("🎉 Đồng bộ hóa hoàn tất! Cơ sở dữ liệu Cloud đã cập nhật mới nhất.");
      
      // Refresh cloud counts
      await fetchCloudStats();

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Quá trình đồng bộ hóa bị gián đoạn.");
      addLog(`❌ Lỗi đồng bộ: ${err.message || err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 h-full flex flex-col overflow-y-auto animate-fade-in" id="firebase_sync_section">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
            <Cloud className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white font-sans tracking-tight flex items-center gap-1.5">
              Tích hợp Cơ sở dữ liệu Firebase Firestore
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Hoạt động</span>
            </h2>
            <p className="text-[10px] text-slate-400 mt-1">Lưu trữ đám mây, sao lưu thời gian thực, đảm bảo an toàn dữ liệu tuyệt đối</p>
          </div>
        </div>

        <button
          onClick={fetchCloudStats}
          disabled={firebaseStats.loading || isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] uppercase font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/60 transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${firebaseStats.loading ? 'animate-spin' : ''}`} />
          Làm mới Đám Mây
        </button>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-2xl text-xs flex items-start gap-2 animate-shake">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-2xl text-xs flex items-start gap-2 animate-fade-in">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        
        {/* Connection Credentials Card */}
        <div className="md:col-span-1 bg-slate-950/40 border border-slate-850 p-5 rounded-2xl space-y-4">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-850 pb-2.5">
            <Database className="w-4 h-4 text-indigo-400" />
            Cấu hình Dự Án
          </h3>
          
          <div className="space-y-3 text-[10px]">
            <div>
              <span className="text-slate-500 block uppercase font-bold tracking-wider text-[8px]">Project ID</span>
              <span className="text-slate-300 font-mono break-all">{firebaseConfig.projectId}</span>
            </div>
            <div>
              <span className="text-slate-500 block uppercase font-bold tracking-wider text-[8px]">Database Name (Firestore)</span>
              <span className="text-slate-300 font-mono break-all text-indigo-300">{firebaseConfig.firestoreDatabaseId || "(default)"}</span>
            </div>
            <div>
              <span className="text-slate-500 block uppercase font-bold tracking-wider text-[8px]">Firebase Cloud Region</span>
              <span className="text-amber-400 font-mono">asia-east1 (Đông Á)</span>
            </div>
            <div className="pt-2 border-t border-slate-850/60 flex items-center gap-2 text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Cơ chế bảo mật SSL / TLS mã hóa dữ liệu 256-bit</span>
            </div>
          </div>
        </div>

        {/* Live Cloud Storage Counts */}
        <div className="md:col-span-2 bg-slate-950/40 border border-slate-850 p-5 rounded-2xl">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-850 pb-2.5 mb-4">
            <Activity className="w-4 h-4 text-amber-400" />
            Số liệu Thực tế trên Cloud Firestore
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            
            <div className="bg-slate-900 border border-slate-850 p-3.5 rounded-xl text-center space-y-1">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Người dùng</span>
              <div className="text-base font-black text-white">{firebaseStats.loading ? '...' : firebaseStats.users}</div>
            </div>

            <div className="bg-slate-900 border border-slate-850 p-3.5 rounded-xl text-center space-y-1">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Tin nhắn cá nhân</span>
              <div className="text-base font-black text-white">{firebaseStats.loading ? '...' : firebaseStats.messages}</div>
            </div>

            <div className="bg-slate-900 border border-slate-850 p-3.5 rounded-xl text-center space-y-1">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
                <Rss className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Vòng thời gian</span>
              <div className="text-base font-black text-white">{firebaseStats.loading ? '...' : firebaseStats.feeds}</div>
            </div>

            <div className="bg-slate-900 border border-slate-850 p-3.5 rounded-xl text-center space-y-1">
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto">
                <Layers className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Nhóm Chat</span>
              <div className="text-base font-black text-white">{firebaseStats.loading ? '...' : firebaseStats.groups}</div>
            </div>

          </div>

          <div className="mt-4 p-3 bg-slate-900/60 border border-slate-850 rounded-xl flex items-start gap-2 text-[10px] text-slate-400 leading-normal">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              Hệ thống ZNet sử dụng cơ chế <span className="text-white font-semibold">Tích hợp Kép</span>. Dữ liệu được ghi nội bộ vào cơ sở dữ liệu SQLite siêu tốc, đồng thời hỗ trợ đồng bộ hóa đám mây Firestore để bảo mật dữ liệu tuyệt đối và cho phép bạn khôi phục mọi lúc, mọi nơi.
            </p>
          </div>
        </div>

      </div>

      {/* Sync Engine Controls & Log console */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-5 gap-6">
        
        {/* Control launcher panel */}
        <div className="md:col-span-2 space-y-4 flex flex-col justify-between">
          <div className="bg-slate-950/20 border border-slate-850 p-5 rounded-2xl space-y-4 flex-1 flex flex-col justify-center">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/15">
                <Flame className={`w-6 h-6 ${isSyncing ? 'animate-bounce text-amber-500' : ''}`} />
              </div>
              <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">Đồng Bộ Hóa SQLite → Firebase</h4>
              <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                Tải lên tất cả các dữ liệu bao gồm Người dùng, Vòng thời gian, Tin nhắn riêng tư, Nhóm và Tin nhắn nhóm từ SQLite cục bộ lên Cloud Firebase Firestore.
              </p>
            </div>

            {isSyncing && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-slate-400">Tiến trình đồng bộ:</span>
                  <span className="text-indigo-400 font-bold">{syncProgress}%</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-amber-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleFullSync}
              disabled={isSyncing}
              className={`w-full py-3.5 px-4 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-2 shadow-lg ${
                isSyncing 
                  ? 'bg-slate-800 text-slate-500 border border-slate-750' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/10 hover:shadow-indigo-500/20 border border-indigo-500/30'
              }`}
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Đang sao lưu lên đám mây ({syncProgress}%)
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Bắt đầu Đồng bộ hóa Toàn diện
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sync Console Logs Panel */}
        <div className="md:col-span-3 bg-slate-950 border border-slate-850 rounded-2xl p-4 flex flex-col h-full min-h-[220px]">
          <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider block mb-2 border-b border-slate-850 pb-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-450 bg-amber-500 animate-pulse" />
            Bảng Điều Khiển Đồng Bộ Hóa (Sync Logs)
          </span>

          <div className="flex-1 overflow-y-auto font-mono text-[9px] text-slate-350 space-y-1.5 pr-2 select-all max-h-[260px]">
            {syncLogs.length === 0 ? (
              <div className="text-slate-600 italic h-full flex items-center justify-center">
                Chưa có nhật ký hoạt động nào. Hãy nhấn nút đồng bộ để khởi chạy.
              </div>
            ) : (
              syncLogs.map((log, idx) => (
                <div 
                  key={idx} 
                  className={`leading-relaxed break-all ${
                    log.includes('✓') ? 'text-emerald-400' :
                    log.includes('❌') ? 'text-rose-400' :
                    log.includes('🚀') || log.includes('🎉') ? 'text-indigo-300 font-bold' : 'text-slate-300'
                  }`}
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
