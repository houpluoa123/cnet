/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, UserPlus, LogIn, ChevronRight, Check, AlertCircle, Zap, Terminal, Copy, Chrome } from 'lucide-react';
import { User } from '../types';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

interface AuthFormProps {
  onAuthSuccess: (token: string, user: User) => void;
}

export default function AuthForm({ onAuthSuccess }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [require2FA, setRequire2FA] = useState<boolean>(false);
  
  // Design states
  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Cloudflare and system troubleshooting diagnostic
  const [cfDiagnostic, setCfDiagnostic] = useState<{
    type: 'security_challenge' | 'gateway_error' | 'not_found' | 'other';
    title: string;
    details: string;
    steps: string[];
    htmlExcerpt?: string;
    status?: number;
  } | null>(null);

  const diagnoseHtmlResponse = (htmlText: string, status: number) => {
    const textLower = htmlText.toLowerCase();
    
    if (textLower.includes('502 bad gateway') || status === 502) {
      setCfDiagnostic({
        type: 'gateway_error',
        title: 'Lỗi 502 Bad Gateway (Lỗi Cổng Kết Nối)',
        details: 'Cloudflare Tunnel hoặc Proxy của bạn không thể chuyển tiếp yêu cầu đến cổng 3000. Điều này xảy ra khi tiến trình máy chủ Node.js chưa chạy hoặc đã bị sập.',
        steps: [
          'Kiểm tra xem Express server đã khởi chạy chưa: Chạy lệnh `pm2 status` hoặc `lsof -i :3000` trên VPS.',
          'Đảm bảo Cloudflare Tunnel trỏ đúng vào địa chỉ `http://localhost:3000` (dùng giao thức HTTP, không chọn HTTPS).',
          'Xem nhật ký lỗi của máy chủ bằng lệnh `pm2 logs` hoặc đọc file `znet_runtime.log`.'
        ],
        htmlExcerpt: htmlText.slice(0, 300),
        status
      });
    } else if (textLower.includes('521') || textLower.includes('web server is down') || status === 521) {
      setCfDiagnostic({
        type: 'gateway_error',
        title: 'Lỗi 521 Web Server Is Down (Máy Chủ Ngoại Tuyến)',
        details: 'Máy chủ backend của bạn không phản hồi kết nối từ Cloudflare Tunnel. Tiến trình ZNet có thể đã bị sập hoàn toàn.',
        steps: [
          'Chạy lệnh `npm run start` hoặc khởi động lại PM2: `pm2 restart znet`.',
          'Kiểm tra firewall (UFW/iptables) trên VPS của bạn xem có đang chặn các kết nối nội bộ không.'
        ],
        htmlExcerpt: htmlText.slice(0, 300),
        status
      });
    } else if (
      textLower.includes('cloudflare') || 
      textLower.includes('cf-challenge') || 
      textLower.includes('turnstile') || 
      textLower.includes('captcha') || 
      textLower.includes('just a moment') ||
      textLower.includes('security check') ||
      textLower.includes('ray id') ||
      status === 403
    ) {
      setCfDiagnostic({
        type: 'security_challenge',
        title: 'Cloudflare Security Challenge / WAF Blocked 🛡️',
        details: 'Tính năng bảo mật của Cloudflare (Web Application Firewall - WAF) hoặc Bot Fight Mode đã chặn yêu cầu API tự động từ trình duyệt và trả về trang xác thực HTML (CAPTCHA / Challenge).',
        steps: [
          'Vào Cloudflare Dashboard -> Security -> WAF -> Custom Rules, tạo quy tắc miễn trừ (Bypass rule): Nếu URI Path chứa `/api/` thì chọn Action là "Bypass" (Bỏ qua bảo mật cho API).',
          'Tắt tạm thời "Bot Fight Mode" hoặc "Under Attack Mode" trong Security -> Settings nếu đang bật.',
          'Nếu sử dụng Cloudflare Access / Zero Trust, hãy đảm bảo bạn đã cấu hình chính sách cho phép bypass các đường dẫn API public này.'
        ],
        htmlExcerpt: htmlText.slice(0, 300),
        status
      });
    } else {
      setCfDiagnostic({
        type: 'other',
        title: `Nhận phản hồi dạng HTML thay vì JSON (Mã trạng thái: ${status})`,
        details: 'Máy chủ phản hồi bằng trang HTML. Lỗi này 99% xảy ra do đường truyền yêu cầu API bị chuyển hướng (Redirect HTTP sang HTTPS hoặc chuyển non-WWW sang WWW), khiến trình duyệt chuyển yêu cầu POST thành GET và trả về trang chủ HTML, hoặc do VPS của bạn chưa chạy tệp server.ts đã biên dịch mới nhất.',
        steps: [
          'Chắc chắn rằng bạn đang sử dụng địa chỉ HTTPS chuẩn khi truy cập (ví dụ: https://znet.yourdomain.com chứ không dùng giao thức http:// ẩn).',
          'Kiểm tra cấu hình Page Rules / Redirects trong Cloudflare xem có quy tắc nào đang tự động chuyển hướng đường dẫn /api/* hoặc biến đổi yêu cầu không.',
          'Đảm bảo rằng bạn đã chạy tập lệnh vá lỗi mới nhất và biên dịch dự án thành công (npm run build).',
          'Khởi động lại tiến trình server bằng tập lệnh znet-patcher.sh để áp dụng các thay đổi hoàn hảo.'
        ],
        htmlExcerpt: htmlText.slice(0, 300),
        status
      });
    }
  };

  const avatarOptions = [
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Felix',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Jack',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Cookie',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Buster',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Milo'
  ];

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setCfDiagnostic(null);
    
    if (!username.trim() || !password) {
      setErrorMsg('Vui lòng điền đầy đủ tài khoản và mật khẩu!');
      return;
    }

    setIsLoading(true);
    try {
      if (isLogin) {
        // Step login
        const loginPayload: any = {
          username: username.trim(),
          password: password
        };
        if (require2FA && otp) {
          loginPayload.otp = otp;
        }

        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginPayload)
        });

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const bodyText = await res.text();
          console.error("Non-JSON login response body:", bodyText);
          diagnoseHtmlResponse(bodyText, res.status);
          throw new Error('Đường truyền phản hồi từ máy chủ không hợp lệ (Không phải JSON). Hãy xem bảng chẩn đoán hệ thống ngay bên dưới!');
        }

        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Đăng nhập thất bại.');
        }

        if (data.require2FA) {
          setRequire2FA(true);
          setSuccessMsg('Tài khoản đã kích hoạt 2FA. Vui lòng nhập mã OTP 6 số để hoàn tất!');
        } else if (data.success && data.token && data.user) {
          onAuthSuccess(data.token, data.user);
        }
      } else {
        // Step register
        const registerPayload = {
          username: username.trim(),
          password: password,
          avatar: selectedAvatar || undefined
        };

        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registerPayload)
        });

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const bodyText = await res.text();
          console.error("Non-JSON register response body:", bodyText);
          diagnoseHtmlResponse(bodyText, res.status);
          throw new Error('Máy chủ phản hồi định dạng đăng ký không phải JSON. Hãy xem bảng chẩn đoán Cloudflare bên dưới!');
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Đăng ký tài khoản thất bại.');
        }

        setSuccessMsg('Đăng ký tài khoản ZNet thành công! Vui lòng chuyển sang Đăng nhập.');
        setIsLogin(true);
        // Clear secret
        setOtp('');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Có lỗi hệ thống xảy ra. Vui lòng thử lại!');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAuthMode = () => {
    setErrorMsg('');
    setSuccessMsg('');
    setCfDiagnostic(null);
    setIsLogin(!isLogin);
    setRequire2FA(false);
    setOtp('');
  };

  const handleGoogleSignIn = async () => {
    if (!auth) {
      setErrorMsg('Hệ thống Firebase Auth chưa được khởi tạo thành công.');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    setCfDiagnostic(null);
    setIsLoading(true);

    try {
      console.log("[ZNET GOOGLE] Triggering Firebase Google Popup...");
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      if (!user || !user.email) {
        throw new Error('Đăng nhập Google thành công nhưng không lấy được thông tin Email liên kết.');
      }

      console.log("[ZNET GOOGLE] Firebase popup success, user email:", user.email);

      // Exchange with backend
      const res = await fetch('/api/auth/google-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleId: user.uid,
          email: user.email,
          displayName: user.displayName || '',
          photoURL: user.photoURL || ''
        })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const bodyText = await res.text();
        diagnoseHtmlResponse(bodyText, res.status);
        throw new Error('Đường truyền phản hồi từ máy chủ không hợp lệ (Không phải JSON). Hãy xem chẩn đoán bên dưới!');
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Xác thực Google trên hệ thống ZNet thất bại.');
      }

      if (data.success && data.token && data.user) {
        onAuthSuccess(data.token, data.user);
      }
    } catch (err: any) {
      console.error("[ZNET GOOGLE] Google sign-in failed:", err);
      let msg = err.message || 'Đăng nhập Google gặp lỗi bất ngờ. Vui lòng thử lại!';
      if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Cửa sổ đăng nhập Google đã bị đóng trước khi hoàn tất xác thực.';
      } else if (err.code === 'auth/cancelled-popup-request') {
        msg = 'Tiến trình đăng nhập bằng Google đã bị hủy bỏ.';
      } else if (err.code === 'auth/popup-blocked') {
        msg = 'Trình duyệt của bạn đã chặn cửa sổ Popup Google. Vui lòng cho phép hiện Popups cho trang web này và tải lại trang.';
      }
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto" id="auth_container">
      <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl overflow-hidden">
        {/* Decorative ambient background */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8 relative z-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-500/10 rounded-2xl text-indigo-400 mb-4 border border-indigo-500/20">
            <Shield className="w-7 h-7" id="auth_icon_seal" />
          </div>
          <h2 className="text-3xl font-bold font-sans tracking-tight text-white mb-2" id="auth_app_title">
            {isLogin ? 'Chào mừng tới ZNet' : 'Thiết lập Tài khoản'}
          </h2>
          <p className="text-slate-400 text-sm">
            {isLogin 
              ? 'Mạng xã hội thời gian thực bảo mật cao cực kỳ mượt mà' 
              : 'Hãy đăng ký một tài khoản để trò chuyện và kết nối kết bạn'}
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm mb-6 animate-fade-in" id="auth_err_box">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-emerald-400 text-sm mb-6 animate-fade-in" id="auth_success_box">
            <Check className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {cfDiagnostic && (
          <div className="bg-slate-950/90 border border-amber-500/30 rounded-2xl p-5 mb-6 animate-fade-in text-slate-300 space-y-4 text-xs leading-relaxed" id="auth_cf_diagnostic_box">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Zap className="w-5 h-5 animate-pulse" />
              <span>{cfDiagnostic.title}</span>
            </div>
            <p className="text-slate-400">{cfDiagnostic.details}</p>
            
            <div className="space-y-2">
              <div className="font-semibold text-slate-200">🛠️ Các bước xử lý thực chiến:</div>
              <ul className="list-decimal list-inside space-y-1.5 pl-1 text-slate-300">
                {cfDiagnostic.steps.map((step, sIdx) => (
                  <li key={sIdx} className="leading-normal">{step}</li>
                ))}
              </ul>
            </div>

            {cfDiagnostic.htmlExcerpt && (
              <div className="space-y-1">
                <div className="font-semibold text-slate-400 flex items-center justify-between">
                  <span>Trích đoạn phản hồi nhận được (HTML):</span>
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-mono">STATUS {cfDiagnostic.status}</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg overflow-x-auto max-h-24 text-[10px] font-mono text-rose-300/80 break-all select-all whitespace-pre-wrap">
                  {cfDiagnostic.htmlExcerpt}
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-5 relative z-10" id="auth_form_element">
          {!require2FA ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Tên tài khoản
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    maxLength={30}
                    placeholder="Nhập tên đăng nhập..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 text-white rounded-xl py-3 pl-4 pr-10 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm transition"
                    id="auth_input_username"
                  />
                  <Shield className="absolute right-3.5 top-3.5 w-4.5 h-4.5 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Mật khẩu bảo mật
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    maxLength={50}
                    placeholder="Nhập khẩu truy cập..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-800 text-white rounded-xl py-3 pl-4 pr-10 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm transition"
                    id="auth_input_password"
                  />
                  <Key className="absolute right-3.5 top-3.5 w-4.5 h-4.5 text-slate-500" />
                </div>
              </div>

              {!isLogin && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Chọn Ảnh Đại Diện (Avatar)
                  </label>
                  <div className="grid grid-cols-6 gap-2 pt-1" id="auth_avatar_grid">
                    {avatarOptions.map((avatarUrl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedAvatar(avatarUrl)}
                        className={`relative rounded-xl overflow-hidden border-2 aspect-square p-1 bg-slate-950/50 hover:scale-105 transition ${
                          selectedAvatar === avatarUrl ? 'border-indigo-500 scale-105 ring-2 ring-indigo-500/20' : 'border-slate-850 hover:border-slate-700'
                        }`}
                        id={`auth_avatar_btn_${idx}`}
                      >
                        <img referrerPolicy="no-referrer" src={avatarUrl} alt="Avatar option" className="w-full h-full object-cover rounded-lg" />
                        {selectedAvatar === avatarUrl && (
                          <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                            <Check className="w-5 h-5 text-indigo-400 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 space-y-4 animate-fade-in" id="auth_otp_step">
              <div className="text-center space-y-1">
                <Shield className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
                <h3 className="text-white font-semibold text-base">Xác Nhận Đang Truy Cập</h3>
                <p className="text-xs text-slate-400">
                  Mở ứng dụng Google Authenticator và nhập mã OTP 6 chữ số dưới đây:
                </p>
              </div>

              <div>
                <input
                  type="text"
                  required
                  maxLength={32}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full text-center bg-slate-950 border border-slate-850 text-white rounded-xl py-3 text-2xl font-mono tracking-widest focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  id="auth_input_otp"
                />
                {/[a-zA-Z]/.test(otp) && (
                  <p className="text-amber-400 text-[10px] mt-2.5 text-left bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 leading-relaxed font-sans">
                    ⚠️ <strong>Lưu ý chữ cái:</strong> Bạn đang nhập các chữ cái vào trường OTP. Hãy mở ứng dụng Google Authenticator trên điện thoại và tìm dòng mã số gồm <strong>6 chữ số thay đổi liên tục</strong> ứng với tài khoản ZNet để nhập vào đây!
                  </p>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 text-white rounded-xl py-3.5 font-semibold text-sm transition shadow-lg cursor-pointer hover:scale-[1.02] active:scale-95"
            id="auth_submit_btn"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : require2FA ? (
              <>Xác Thực OTP <ChevronRight className="w-4 h-4" /></>
            ) : isLogin ? (
              <>Đăng Nhập Ngay <LogIn className="w-4 h-4" /></>
            ) : (
              <>Đăng Ký Tài Khoản <UserPlus className="w-4 h-4" /></>
            )}
          </button>
        </form>

        {!require2FA && (
          <>
            <div className="flex items-center my-4 relative z-10">
              <div className="flex-1 border-t border-slate-800/60"></div>
              <span className="px-3 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Hoặc sử dụng tài khoản</span>
              <div className="flex-1 border-t border-slate-800/60"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2.5 bg-slate-950/85 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 disabled:opacity-50 text-slate-200 rounded-xl py-3.5 font-bold text-xs transition cursor-pointer hover:scale-[1.01] active:scale-95 relative z-10"
              id="google_signin_btn"
            >
              <Chrome className="w-4 h-4 text-rose-500 animate-pulse" />
              <span>{isLogin ? 'Đăng nhập bằng Google' : 'Đăng ký bằng Google'}</span>
            </button>
          </>
        )}

        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center relative z-10" id="auth_mode_toggle_container">
          <button
            type="button"
            onClick={toggleAuthMode}
            className="text-indigo-400 hover:text-indigo-300 font-medium text-xs hover:underline transition"
            id="auth_toggle_mode_btn"
          >
            {isLogin ? 'Chưa có tài khoản? Hãy Đăng ký miễn phí' : 'Đã có tài khoản? Đăng nhập ngay'}
          </button>
        </div>
      </div>
    </div>
  );
}
