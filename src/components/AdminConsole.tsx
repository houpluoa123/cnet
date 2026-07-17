import React, { useState, useEffect } from 'react';
import { apiFetch as fetch } from '../lib/api';
import { 
  Server, 
  Terminal, 
  Database, 
  Shield, 
  Trash2, 
  Send, 
  UserX, 
  RefreshCw, 
  Cpu, 
  HardDrive, 
  Radio, 
  Check, 
  AlertTriangle 
} from 'lucide-react';

interface AdminConsoleProps {
  token: string | null;
}

interface SystemStats {
  dbSize: number;
  users: number;
  feeds: number;
  messages: number;
  friends: number;
  uptime: number;
  ramMb: number;
  activeWsConnections: number;
  nodeVersion: string;
  platform: string;
}

export default function AdminConsole({ token }: AdminConsoleProps) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  
  // Database explorer states
  const [activeTable, setActiveTable] = useState<'users' | 'feeds' | 'messages' | 'friends'>('users');
  const [tableData, setTableData] = useState<any[]>([]);
  const [loadingTable, setLoadingTable] = useState<boolean>(false);
  const [tableError, setTableError] = useState<string>('');

  // Action states
  const [broadcastMsg, setBroadcastMsg] = useState<string>('');
  const [broadcastSuccess, setBroadcastSuccess] = useState<string>('');
  const [broadcastError, setBroadcastError] = useState<string>('');
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);

  // Quick moderation inputs
  const [targetPostId, setTargetPostId] = useState<string>('');
  const [postActionMsg, setPostActionMsg] = useState<string>('');
  const [postActionErr, setPostActionErr] = useState<string>('');
  const [isDeletingPost, setIsDeletingPost] = useState<boolean>(false);

  const [targetUserId, setTargetUserId] = useState<string>('');
  const [userActionMsg, setUserActionMsg] = useState<string>('');
  const [userActionErr, setUserActionErr] = useState<string>('');
  const [isDeletingUser, setIsDeletingUser] = useState<boolean>(false);

  // Terminal Simulator Logs
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    '[HỆ THỐNG ZNET] Khởi tạo thiết bị quan sát trung tâm quản trị...',
    '[CSDL] Kết nối thành công tới SQLite: social.db',
    '[WS] Máy chủ websocket đang lắng nghe dòng dữ liệu...',
    '[SERENDIPITY] Khởi tạo bảng kiểm soát điều hành tối cao hoàn tất.'
  ]);

  const addTerminalLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [...prev.slice(-15), `[${timestamp}] ${msg}`]);
  };

  const fetchStats = async () => {
    if (!token) return;
    setLoadingStats(true);
    try {
      const res = await fetch('/api/admin/system-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể tải thống kê máy chủ');
      setStats(data);
      addTerminalLog(`Tìm nạp hiệu năng hệ thống: RAM sử dụng ${data.ramMb} MB, CSDL ${Math.round(data.dbSize / 1024)} KB.`);
    } catch (err: any) {
      console.error(err);
      addTerminalLog(`⚠️ LỖI: Nhận trạng thái hệ thống thất bại: ${err.message}`);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchTableRows = async (tableName: string) => {
    if (!token) return;
    setLoadingTable(true);
    setTableError('');
    try {
      const res = await fetch(`/api/admin/table/${tableName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi truy xuất bảng');
      setTableData(data);
      addTerminalLog(`[CSDL] Truy vấn lệnh: SELECT * FROM ${tableName} ORDER BY id DESC LIMIT 100.`);
    } catch (err: any) {
      setTableError(err.message);
      addTerminalLog(`⚠️ LỖI TRUY VẤN: Lỗi phân tích SQLite cho bảng ${tableName}: ${err.message}`);
    } finally {
      setLoadingTable(false);
    }
  };

  // Run broadcast warning
  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !broadcastMsg.trim()) return;
    setIsBroadcasting(true);
    setBroadcastSuccess('');
    setBroadcastError('');
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: broadcastMsg })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi phát thông báo');
      setBroadcastSuccess(data.message || 'Đã phát tin nhắn tới toàn bộ hệ thống!');
      addTerminalLog(`📢 PHÁT SÓNG: "${broadcastMsg}"`);
      setBroadcastMsg('');
      fetchStats(); // Update active sockets if any change
      setTimeout(() => setBroadcastSuccess(''), 4000);
    } catch (err: any) {
      setBroadcastError(err.message);
      addTerminalLog(`⚠️ LỖI PHÁT SÓNG: ${err.message}`);
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Run delete post
  const handleDeletePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !targetPostId.trim()) return;
    const feedId = parseInt(targetPostId);
    if (isNaN(feedId)) {
      setPostActionErr('ID bài viết không hợp lệ!');
      return;
    }
    setIsDeletingPost(true);
    setPostActionMsg('');
    setPostActionErr('');
    try {
      const res = await fetch(`/api/admin/feeds/delete/${feedId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi xóa bài viết');
      setPostActionMsg(data.message || `Đã xóa bài viết ID ${feedId}`);
      addTerminalLog(`🔥 MODERATION: Đã thanh trừng bài viết ID: ${feedId}`);
      setTargetPostId('');
      fetchStats();
      if (activeTable === 'feeds') fetchTableRows('feeds');
      setTimeout(() => setPostActionMsg(''), 4000);
    } catch (err: any) {
      setPostActionErr(err.message);
    } finally {
      setIsDeletingPost(false);
    }
  };

  // Run delete user
  const handleDeleteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !targetUserId.trim()) return;
    const userId = parseInt(targetUserId);
    if (isNaN(userId)) {
      setUserActionErr('ID tài khoản không hợp lệ!');
      return;
    }
    
    if (!window.confirm(`⚠️ CẢNH BÁO CỰC KỲ NGUY HIỂM ⚠️\nBạn có chắc chắn muốn xóa vĩnh viễn tài khoản mang ID ${userId} cùng toàn bộ tin nhắn, bài viết liên quan khỏi hệ thống không? Hành động này không thể hoàn tác.`)) {
      return;
    }

    setIsDeletingUser(true);
    setUserActionMsg('');
    setUserActionErr('');
    try {
      const res = await fetch(`/api/admin/users/delete/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi trong quá trình thu hồi tài khoản');
      setUserActionMsg(data.message || 'Thu hồi tài khoản thành công.');
      addTerminalLog(`⛔ BANISH: Tài khoản người dùng ID ${userId} đã bị khóa và xóa vĩnh viễn.`);
      setTargetUserId('');
      fetchStats();
      if (activeTable === 'users') fetchTableRows('users');
      setTimeout(() => setUserActionMsg(''), 4000);
    } catch (err: any) {
      setUserActionErr(err.message);
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Formatter for system uptime
  const formatUptime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  // Trigger init queries
  useEffect(() => {
    fetchStats();
    fetchTableRows(activeTable);
    
    // Add dynamic log interval
    const interval = setInterval(() => {
      const randStats = [
        'Giám sát RAM: hệ thống ổn định 100%...',
        'Hệ thống mạng: socket.local dọn dẹp các luồng trống...',
        'SQLite cache status: HIT 99.8%',
        'Ping gateway: RTT to Cloud Run < 2ms.',
        'Hệ thống bảo mật: JWT mã hóa 256-bit hoạt động.'
      ];
      const randomMsg = randStats[Math.floor(Math.random() * randStats.length)];
      addTerminalLog(randomMsg);
    }, 15000);

    return () => clearInterval(interval);
  }, [activeTable]);

  return (
    <div className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 overflow-y-auto space-y-6 h-full text-xs font-sans scrollbar-thin" id="admin_control_cabinet">
      
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800/80 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-white text-base font-extrabold tracking-tight">Hệ Thống Quản Trị & Điều Hành ZNet</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Control Console System v1.0.1 • Thiết lập quyền lực tối cao</p>
          </div>
        </div>
        <button 
          onClick={() => { fetchStats(); fetchTableRows(activeTable); }} 
          className="flex items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 font-medium border border-slate-800 py-2 px-3.5 rounded-xl transition cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Làm mới dữ liệu
        </button>
      </div>

      {/* Grid: Indicators and System Health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="stats_health_block">
        
        <div className="bg-slate-950/40 p-4 border border-slate-850 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="font-semibold text-[10px] uppercase tracking-wider">Tiến trình RAM</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-mono font-bold text-white leading-none">
              {loadingStats ? '...' : `${stats?.ramMb} MB`}
            </h3>
            <span className="text-[9px] text-slate-400 block mt-1">Dung lượng bộ nhớ heap</span>
          </div>
        </div>

        <div className="bg-slate-950/40 p-4 border border-slate-850 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="font-semibold text-[10px] uppercase tracking-wider">Cơ sở dữ liệu SQLite</span>
            <HardDrive className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-mono font-bold text-white leading-none">
              {loadingStats ? '...' : `${Math.round((stats?.dbSize || 0) / 1024)} KB`}
            </h3>
            <span className="text-[9px] text-slate-400 block mt-1">Size file: social.db</span>
          </div>
        </div>

        <div className="bg-slate-950/40 p-4 border border-slate-850 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="font-semibold text-[10px] uppercase tracking-wider">Thời gian On</span>
            <Server className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold text-white leading-none truncate pt-1">
              {loadingStats ? '...' : formatUptime(stats?.uptime || 0)}
            </h3>
            <span className="text-[9px] text-slate-400 block mt-1.5">Thời gian chạy máy chủ</span>
          </div>
        </div>

        <div className="bg-slate-950/40 p-4 border border-slate-850 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="font-semibold text-[10px] uppercase tracking-wider">Ws Trực tuyến</span>
            <Radio className="w-4 h-4 text-pink-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-mono font-bold text-white leading-none">
              {loadingStats ? '...' : `${stats?.activeWsConnections} Client`}
            </h3>
            <span className="text-[9px] text-slate-400 block mt-1">Client kết nối đồng thời</span>
          </div>
        </div>

      </div>

      {/* Grid: Double column layouts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Broadcast & Moderate Actions */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* System Broadcast Card */}
          <div className="bg-slate-950/20 p-5 border border-slate-840 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Radio className="w-4 h-4 text-indigo-400" />
              <h3 className="text-slate-200 font-bold uppercase tracking-wider text-[11px]">Phát sóng toàn hệ thống</h3>
            </div>
            
            <form onSubmit={handleBroadcast} className="space-y-3">
              <p className="text-[10px] text-slate-405 leading-relaxed">
                Tin nhắn này sẽ hiển thị dưới dạng một banner cảnh báo nhấp nháy màu đỏ trên đầu toàn bộ trình duyệt đang online của người dùng theo thời gian thực.
              </p>
              
              {broadcastSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2.5 rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{broadcastSuccess}</span>
                </div>
              )}
              {broadcastError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-2.5 rounded-xl">
                  <span>{broadcastError}</span>
                </div>
              )}

              <textarea
                required
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                placeholder="Ví dụ: Bảo trì máy chủ định kỳ lúc 0h đêm nay, vui lòng lưu lại dữ liệu..."
                className="w-full h-20 bg-slate-950 border border-slate-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-rose-500 transition resize-none leading-relaxed"
              />

              <button
                type="submit"
                disabled={isBroadcasting}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-2.5 px-4 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider text-[10px]"
              >
                <Send className="w-3.5 h-3.5" /> {isBroadcasting ? 'Thực thi phát...' : 'Phát Sóng Ngay'}
              </button>
            </form>
          </div>

          {/* Moderate Core Card */}
          <div className="bg-slate-950/20 p-5 border border-slate-840 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <h3 className="text-rose-400 font-bold uppercase tracking-wider text-[11px]">Vùng xử phạt & Điều hành</h3>
            </div>

            {/* Sub-form 1: Delete Post */}
            <form onSubmit={handleDeletePost} className="space-y-2 pb-3 border-b border-slate-850/80">
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Xoá bài viết theo ID</label>
              
              {postActionMsg && <p className="text-emerald-400 text-[10px] bg-emerald-500/5 p-1 px-2 rounded-lg">{postActionMsg}</p>}
              {postActionErr && <p className="text-rose-400 text-[10px] bg-rose-500/5 p-1 px-2 rounded-lg">{postActionErr}</p>}

              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="ID: 15"
                  value={targetPostId}
                  onChange={(e) => setTargetPostId(e.target.value)}
                  className="w-20 text-center bg-slate-950 border border-slate-800 text-white rounded-xl py-2 focus:outline-none focus:border-rose-500 transition font-mono"
                />
                <button
                  type="submit"
                  disabled={isDeletingPost}
                  className="flex-1 bg-slate-950 hover:bg-rose-950/30 text-rose-400 hover:text-rose-300 border border-rose-900/30 hover:border-rose-500/50 font-bold py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-[10px]"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {isDeletingPost ? 'Xóa...' : 'Thanh trừng Post'}
                </button>
              </div>
            </form>

            {/* Sub-form 2: Ban/Delete User */}
            <form onSubmit={handleDeleteUser} className="space-y-2">
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Thu hồi / Hoá kiếp tài khoản</label>
              
              {userActionMsg && <p className="text-emerald-400 text-[10px] bg-emerald-500/5 p-1 px-2 rounded-lg">{userActionMsg}</p>}
              {userActionErr && <p className="text-rose-400 text-[10px] bg-rose-500/5 p-1 px-2 rounded-lg">{userActionErr}</p>}

              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="ID: 4"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-20 text-center bg-slate-950 border border-slate-800 text-white rounded-xl py-2 focus:outline-none focus:border-rose-500 transition font-mono"
                />
                <button
                  type="submit"
                  disabled={isDeletingUser}
                  className="flex-1 bg-rose-750/15 hover:bg-red-650/30 text-red-400 hover:text-red-300 border border-red-900/30 hover:border-red-500 font-extrabold py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider"
                >
                  <UserX className="w-3.5 h-3.5" /> {isDeletingUser ? 'Thu hồi...' : 'Xóa Tài Khoản'}
                </button>
              </div>
            </form>
          </div>

        </div>

        {/* Right Side: Database Explorer Tables & Terminal Logs */}
        <div className="lg:col-span-2 space-y-6 flex flex-col justify-between">
          
          {/* Section: Terminal Simulator Outputs */}
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 space-y-2 shrink-0">
            <div className="flex items-center justify-between border-b border-slate-850 pb-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-300 font-mono font-bold tracking-tight text-[10px]">ZNet Terminal Output Simulator</span>
              </div>
              <span className="text-[9px] font-mono text-emerald-400 animate-pulse font-semibold">● ONLINE</span>
            </div>
            
            <div className="bg-slate-950/90 h-32 overflow-y-auto font-mono text-[10px] text-emerald-400 p-2.5 rounded-xl space-y-1 scrollbar-thin leading-relaxed">
              {terminalLogs.map((log, index) => (
                <div key={index} className="truncate">
                  <span className="text-slate-650 select-none mr-1.5">&gt;</span>
                  {log}
                </div>
              ))}
            </div>
          </div>

          {/* Section: Interactive Database Explorer View */}
          <div className="bg-slate-950/20 p-5 border border-slate-840 rounded-2xl flex-1 flex flex-col space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-1.5">
                <Database className="w-4 h-4 text-blue-400" />
                <h3 className="text-slate-200 font-bold uppercase tracking-wider text-[11px]">Visual Database Explorer</h3>
              </div>
              
              <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
                {(['users', 'feeds', 'messages', 'friends'] as const).map((tbl) => (
                  <button
                    key={tbl}
                    onClick={() => {
                      setActiveTable(tbl);
                      fetchTableRows(tbl);
                    }}
                    className={`px-2 py-1 text-[9px] font-bold uppercase rounded-lg transition cursor-pointer ${
                      activeTable === tbl
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {tbl}
                  </button>
                ))}
              </div>
            </div>

            {/* Table layout */}
            <div className="overflow-x-auto flex-1 rounded-xl border border-slate-850 bg-slate-950/40">
              {loadingTable ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                  <span className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-505 border-t-transparent mb-2" />
                  <p>Đang truy xuất SQLite...</p>
                </div>
              ) : tableError ? (
                <div className="p-4 text-center text-rose-400">{tableError}</div>
              ) : tableData.length === 0 ? (
                <div className="p-10 text-center text-slate-500 font-medium">Bảng này hiện chưa có dòng dữ liệu nào ghi nhận.</div>
              ) : (
                <table className="w-full text-left font-mono text-[10px]">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 select-none">
                      <th className="py-2.5 px-3">ID</th>
                      {activeTable === 'users' && (
                        <>
                          <th className="py-2.5 px-3">Tên</th>
                          <th className="py-2.5 px-3">Quyền</th>
                          <th className="py-2.5 px-3">Trạng thái</th>
                          <th className="py-2.5 px-3">MFA 2FA</th>
                        </>
                      )}
                      {activeTable === 'feeds' && (
                        <>
                          <th className="py-2.5 px-3 font-semibold">User ID</th>
                          <th className="py-2.5 px-3">Nội dung bài viết</th>
                          <th className="py-2.5 px-3">Thích</th>
                          <th className="py-2.5 px-3">Ngày đăng</th>
                        </>
                      )}
                      {activeTable === 'messages' && (
                        <>
                          <th className="py-2.5 px-3">Gửi</th>
                          <th className="py-2.5 px-3">Nhận</th>
                          <th className="py-2.5 px-3">Nội dung tin</th>
                          <th className="py-2.5 px-3">Ngày gửi</th>
                        </>
                      )}
                      {activeTable === 'friends' && (
                        <>
                          <th className="py-2.5 px-3">User ID</th>
                          <th className="py-2.5 px-3">Bạn ID</th>
                          <th className="py-2.5 px-3">Trạng thái</th>
                          <th className="py-2.5 px-3">Kết nối</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 text-slate-300">
                    {tableData.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-900/30 transition">
                        <td className="py-2 px-3 font-bold text-white">{row.id}</td>
                        {activeTable === 'users' && (
                          <>
                            <td className="py-2 px-3 text-indigo-400">{row.username}</td>
                            <td className="py-2 px-3 font-sans">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${row.role === 'admin' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' : 'bg-slate-800 text-slate-400'}`}>
                                {row.role}
                              </span>
                            </td>
                            <td className="py-2 px-3 truncate max-w-[120px]" title={row.status}>{row.status}</td>
                            <td className="py-2 px-3 text-center">{row.two_factor_enabled === 1 ? '✅ Đang bật' : '❌ Tắt'}</td>
                          </>
                        )}
                        {activeTable === 'feeds' && (
                          <>
                            <td className="py-2 px-3">{row.user_id}</td>
                            <td className="py-2 px-3 truncate max-w-[150px]" title={row.content}>{row.content}</td>
                            <td className="py-2 px-3 text-amber-400">♥ {row.likes_count}</td>
                            <td className="py-2 px-3 text-[9px] text-slate-500">{new Date(row.created_at).toLocaleDateString()}</td>
                          </>
                        )}
                        {activeTable === 'messages' && (
                          <>
                            <td className="py-2 px-3">{row.sender_id}</td>
                            <td className="py-2 px-3">{row.receiver_id}</td>
                            <td className="py-2 px-3 truncate max-w-[150px]" title={row.message_text}>{row.message_text}</td>
                            <td className="py-2 px-3 text-[9px] text-slate-500">{new Date(row.created_at).toLocaleDateString()}</td>
                          </>
                        )}
                        {activeTable === 'friends' && (
                          <>
                            <td className="py-2 px-3">{row.user_id}</td>
                            <td className="py-2 px-3">{row.friend_id}</td>
                            <td className="py-2 px-3 font-sans text-amber-500 font-semibold">{row.status}</td>
                            <td className="py-2 px-3 text-[9px] text-slate-500">{new Date(row.created_at).toLocaleDateString()}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
