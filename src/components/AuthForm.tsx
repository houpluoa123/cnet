/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, UserPlus, LogIn, ChevronRight, Check, AlertCircle, Zap, Terminal, Copy, Chrome } from 'lucide-react';
import { User } from '../types';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider, firebaseInitError } from '../lib/firebase';
import { apiFetch as fetch } from '../lib/api';

interface AuthFormProps {
  onAuthSuccess: (token: string, user: User) => void;
}

export default function AuthForm({ onAuthSuccess }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [require2FA, setRequire2FA] = useState<boolean>(false);

  // Secure real email OTP verification states
  const [requireRegisterOTP, setRequireRegisterOTP] = useState<boolean>(false);
  const [registerOtp, setRegisterOtp] = useState<string>('');
  const [requireGoogleOTP, setRequireGoogleOTP] = useState<boolean>(false);
  const [googleOtp, setGoogleOtp] = useState<string>('');
  const [googlePayload, setGooglePayload] = useState<any>(null);
  
  // Design states
  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

    // Forgot / Reset password state
  const [forgotMode, setForgotMode] = useState<'none' | 'request' | 'reset'>('none');
  const [resetUser, setResetUser] = useState<string>('');
  const [resetCode, setResetCode] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [simulatedCode, setSimulatedCode] = useState<string>('');
  const [etherealUrl, setEtherealUrl] = useState<string>('');

  const [showBackendConfig, setShowBackendConfig] = useState<boolean>(false);
  const [backendUrlInput, setBackendUrlInput] = useState<string>(() => {
    return localStorage.getItem('znet_backend_url') || '';
  });

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResultMsg, setTestResultMsg] = useState<string>('');

  const testBackendConnection = async () => {
    setTestStatus('testing');
    setTestResultMsg('');
    let url = backendUrlInput.trim();
    if (!url) {
      // Test current origin
      url = window.location.origin;
    } else {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        const isIpOrLocal = /^[0-9.]+$/.test(url.split(':')[0]) || url.includes('localhost') || url.includes('127.0.0.1');
        url = (isIpOrLocal ? 'http://' : 'https://') + url;
      }
    }

    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    try {
      console.log(`[ZNET TESTING] Fetching ping from: ${url}/api/ping`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const res = await window.fetch(`${url}/api/ping`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && (data.success || data.status === 'ok')) {
          setTestStatus('success');
          setTestResultMsg(`Kết nối thành công! Đã liên kết tới máy chủ và nhận phản hồi ping từ ${url} hợp lệ.`);
        } else {
          setTestStatus('error');
          setTestResultMsg(`Phản hồi từ ${url} không mong muốn (Mã: ${res.status}). Có thể bạn chưa chạy tệp server.ts đã biên dịch mới nhất trên VPS.`);
        }
      } else {
        setTestStatus('error');
        setTestResultMsg(`Kết nối thất bại: Máy chủ trả về mã lỗi HTTP ${res.status}. Vui lòng kiểm tra lại cấu hình VPS.`);
      }
    } catch (e: any) {
      console.error("[ZNET TESTING] Connection error:", e);
      setTestStatus('error');
      
      let errMsg = `Không thể kết nối đến máy chủ tại: ${url}. `;
      if (e.name === 'AbortError') {
        errMsg += 'Thời gian chờ kết nối quá hạn (Timeout 6 giây).';
      } else if (window.location.protocol === 'https:' && url.startsWith('http://')) {
        errMsg += 'Lỗi Mixed Content: Trình duyệt chặn kết nối HTTP từ trang HTTPS này. Bạn PHẢI cấu hình SSL (HTTPS) cho VPS backend hoặc chạy cả frontend trên HTTP để có thể kết nối.';
      } else {
        errMsg += 'Có thể do sai cổng, máy chủ chưa chạy, lỗi CORS hoặc chứng chỉ SSL của tên miền backend chưa được cài đặt.';
      }
      setTestResultMsg(errMsg);
    }
  };

  const saveBackendUrl = () => {
    let url = backendUrlInput.trim();
    if (!url) {
      localStorage.removeItem('znet_backend_url');
      setSuccessMsg('Đã khôi phục địa chỉ kết nối máy chủ về mặc định. Đang tải lại...');
    } else {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        const isIpOrLocal = /^[0-9.]+$/.test(url.split(':')[0]) || url.includes('localhost') || url.includes('127.0.0.1');
        url = (isIpOrLocal ? 'http://' : 'https://') + url;
      }
      localStorage.setItem('znet_backend_url', url);
      setSuccessMsg(`Đã cấu hình liên kết máy chủ thành công tới: ${url}. Đang tải lại...`);
    }
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  const clearBackendUrl = () => {
    localStorage.removeItem('znet_backend_url');
    setBackendUrlInput('');
    setSuccessMsg('Đã xóa địa chỉ kết nối máy chủ. Đang tải lại...');
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser.trim()) {
      setErrorMsg('Vui lòng nhập tên tài khoản hoặc email!');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: resetUser.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Yêu cầu phục hồi mật khẩu thất bại.');
      }

      setSuccessMsg(data.message);
      if (data.code) {
        setSimulatedCode(data.code);
      }
      if (data.etherealUrl) {
        setEtherealUrl(data.etherealUrl);
      } else {
        setEtherealUrl('');
      }
      setForgotMode('reset');
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi hệ thống khi gửi mã xác nhận.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim()) {
      setErrorMsg('Vui lòng nhập mã xác thực OTP!');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('Mật khẩu mới phải dài từ 6 ký tự trở lên!');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: resetUser.trim(),
          code: resetCode.trim(),
          newPassword: newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Đặt lại mật khẩu thất bại.');
      }

      setSuccessMsg(data.message);
      // Success! Move back to login
      setTimeout(() => {
        setForgotMode('none');
        setIsLogin(true);
        setUsername(resetUser);
        setPassword('');
        setResetCode('');
        setNewPassword('');
        setSimulatedCode('');
        setEtherealUrl('');
        setSuccessMsg('');
      }, 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi hệ thống khi đặt lại mật khẩu.');
    } finally {
      setIsLoading(false);
    }
  };

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
          avatar: selectedAvatar || undefined,
          email: email.trim() || undefined,
          otp: requireRegisterOTP ? registerOtp.trim() : undefined
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

        if (data.requireOTP) {
          setRequireRegisterOTP(true);
          setSuccessMsg(data.message || 'Mã xác thực đăng ký đã được gửi tới Email của bạn. Vui lòng nhập mã để hoàn tất!');
          if (data.devCodeFallback) {
            setRegisterOtp(data.devCodeFallback);
          }
        } else {
          setSuccessMsg('Đăng ký tài khoản ZNet thành công! Vui lòng tiến hành đăng nhập.');
          setIsLogin(true);
          setRequireRegisterOTP(false);
          setRegisterOtp('');
          setOtp('');
        }
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
    setRequireRegisterOTP(false);
    setRequireGoogleOTP(false);
    setOtp('');
    setRegisterOtp('');
    setGoogleOtp('');
  };

  const handleGoogleSignIn = async () => {
    if (!auth) {
      setErrorMsg(`Hệ thống Firebase Auth chưa được khởi tạo thành công. ${firebaseInitError ? `Chi tiết: ${firebaseInitError.message}` : 'Không tìm thấy cấu hình Firebase.'}`);
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    setCfDiagnostic(null);
    setIsLoading(true);

    try {
      let currentPayload = googlePayload;

      if (!currentPayload) {
        console.log("[ZNET GOOGLE] Triggering Firebase Google Popup...");
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        if (!user || !user.email) {
          throw new Error('Đăng nhập Google thành công nhưng không lấy được thông tin Email liên kết.');
        }

        console.log("[ZNET GOOGLE] Firebase popup success, user email:", user.email);

        currentPayload = {
          googleId: user.uid,
          email: user.email,
          displayName: user.displayName || '',
          photoURL: user.photoURL || ''
        };
        setGooglePayload(currentPayload);
      }

      // Exchange with backend
      const res = await fetch('/api/auth/google-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentPayload,
          otp: requireGoogleOTP ? googleOtp.trim() : undefined
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

      if (data.requireOTP) {
        setRequireGoogleOTP(true);
        setSuccessMsg(data.message || 'Vui lòng nhập mã OTP gửi tới Email Google của bạn để hoàn tất đăng nhập!');
        if (data.devCodeFallback) {
          setGoogleOtp(data.devCodeFallback);
        }
      } else if (data.success && data.token && data.user) {
        onAuthSuccess(data.token, data.user);
        setRequireGoogleOTP(false);
        setGoogleOtp('');
        setGooglePayload(null);
      }
    } catch (err: any) {
      console.error("[ZNET GOOGLE] Google sign-in failed:", err);
      let msg = err.message || 'Đăng nhập Google gặp lỗi bất ngờ. Vui lòng thử lại!';
      if (err.code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
        msg = 'Cửa sổ đăng nhập Google đã bị đóng. Nếu bạn đang chạy ứng dụng trong khung xem trước AI Studio (iframe), vui lòng bấm nút "Mở trong tab mới" ở góc trên bên phải để đăng nhập Google thành công!';
      } else if (err.code === 'auth/cancelled-popup-request' || msg.includes('cancelled-popup-request')) {
        msg = 'Tiến trình đăng nhập bằng Google đã bị hủy bỏ.';
      } else if (err.code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
        msg = 'Trình duyệt của bạn đã chặn cửa sổ Popup Google. Vui lòng cho phép hiện Popups hoặc mở ứng dụng trong tab mới để đăng nhập.';
      } else if (err.code === 'auth/unauthorized-domain' || msg.toLowerCase().includes('unauthorized-domain') || msg.toLowerCase().includes('unauthorized_client')) {
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'domain của bạn';
        msg = `Tên miền "${currentDomain}" chưa được ủy quyền (Authorized Domain) trong Firebase Console của dự án "znet-e48ea". Hãy truy cập vào cài đặt Firebase Auth (https://console.firebase.google.com/project/znet-e48ea/authentication/providers), chọn tab "Settings", vào mục "Authorized domains" ở menu bên trái, nhấn "Add domain" rồi điền "${currentDomain}" để sửa lỗi này!`;
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

        {forgotMode === 'none' ? (
          <>
            {requireRegisterOTP ? (
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 space-y-5 animate-fade-in relative z-10" id="auth_register_otp_step">
                <div className="text-center space-y-1">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-500/10 rounded-xl text-emerald-400 mb-2 border border-emerald-500/20">
                    <Shield className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="text-white font-bold text-lg">Mã Xác Thực Đăng Ký</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Hệ thống đã gửi một mã OTP gồm 6 chữ số tới Email của bạn (<strong className="text-indigo-300">{email}</strong>). Vui lòng nhập mã để kích hoạt tài khoản!
                  </p>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="Nhập 6 chữ số OTP..."
                      value={registerOtp}
                      onChange={(e) => setRegisterOtp(e.target.value)}
                      className="w-full text-center bg-slate-950 border border-slate-800 text-white rounded-xl py-3.5 text-2xl font-mono tracking-[0.5em] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      id="auth_input_register_otp"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-white rounded-xl py-3.5 font-semibold text-sm transition shadow-lg cursor-pointer hover:scale-[1.02] active:scale-95"
                    id="auth_verify_register_otp_btn"
                  >
                    {isLoading ? (
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Xác Nhận Đăng Ký Tài Khoản ✅</>
                    )}
                  </button>
                </form>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRequireRegisterOTP(false);
                      setRegisterOtp('');
                      setSuccessMsg('');
                      setErrorMsg('');
                    }}
                    className="text-xs text-slate-400 hover:text-indigo-400 hover:underline transition cursor-pointer"
                    id="back_to_register_btn"
                  >
                    Quay lại biểu mẫu đăng ký
                  </button>
                </div>
              </div>
            ) : requireGoogleOTP ? (
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 space-y-5 animate-fade-in relative z-10" id="auth_google_otp_step">
                <div className="text-center space-y-1">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-rose-500/10 rounded-xl text-rose-400 mb-2 border border-rose-500/20">
                    <Chrome className="w-6 h-6 animate-pulse" />
                  </div>
                  <h3 className="text-white font-bold text-lg">Xác Thực OTP Google</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Đăng nhập Google yêu cầu mã xác thực. Mã OTP 6 chữ số đã được gửi tới Email Google của bạn (<strong className="text-indigo-300">{googlePayload?.email}</strong>).
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="Nhập 6 chữ số OTP..."
                      value={googleOtp}
                      onChange={(e) => setGoogleOtp(e.target.value)}
                      className="w-full text-center bg-slate-950 border border-slate-800 text-white rounded-xl py-3.5 text-2xl font-mono tracking-[0.5em] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      id="auth_input_google_otp"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-550 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 text-white rounded-xl py-3.5 font-semibold text-sm transition shadow-lg cursor-pointer hover:scale-[1.02] active:scale-95"
                    id="auth_verify_google_otp_btn"
                  >
                    {isLoading ? (
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Hoàn Tất Xác Thực Đăng Nhập 🔑</>
                    )}
                  </button>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRequireGoogleOTP(false);
                      setGoogleOtp('');
                      setGooglePayload(null);
                      setSuccessMsg('');
                      setErrorMsg('');
                    }}
                    className="text-xs text-slate-400 hover:text-rose-400 hover:underline transition cursor-pointer"
                    id="cancel_google_otp_btn"
                  >
                    Hủy bỏ & Quay lại Đăng nhập
                  </button>
                </div>
              </div>
            ) : (
              <>
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
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Mật khẩu bảo mật
                          </label>
                          {isLogin && (
                            <button
                              type="button"
                              onClick={() => {
                                setForgotMode('request');
                                setErrorMsg('');
                                setSuccessMsg('');
                                setSimulatedCode('');
                              }}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition hover:underline cursor-pointer font-medium"
                              id="forgot_pwd_toggle_btn"
                            >
                              Quên mật khẩu?
                            </button>
                          )}
                        </div>
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
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            Địa chỉ Email (Bắt buộc để nhận mã OTP xác thực)
                          </label>
                          <div className="relative">
                            <input
                              type="email"
                              required
                              placeholder="nhap-email@example.com..."
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full bg-slate-950/60 border border-slate-800 text-white rounded-xl py-3 pl-4 pr-10 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm transition"
                              id="auth_input_email"
                            />
                            <span className="absolute right-3.5 top-3.5 text-xs text-slate-500 font-bold font-mono">@</span>
                          </div>
                        </div>
                      )}

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
                                }}`}
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
                      <>Gửi Mã OTP Đăng Ký <UserPlus className="w-4 h-4" /></>
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

                    {typeof window !== 'undefined' && window.self !== window.top && (
                      <div className="mt-3 bg-amber-500/5 border border-amber-500/15 text-amber-400 text-[10px] p-3 rounded-xl leading-relaxed space-y-0.5 relative z-10 text-left">
                        <p className="font-semibold">⚠️ Khung xem trước (Iframe Detected):</p>
                        <p>Trình duyệt sẽ chặn popup Google Auth bên trong khung này. Hãy bấm biểu tượng <strong>"Mở trong tab mới"</strong> ở trên cùng bên phải trang để đăng nhập bằng Google!</p>
                      </div>
                    )}
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
              </>
            )}
          </>
        ) : forgotMode === 'request' ? (
          <form onSubmit={handleRequestResetCode} className="space-y-5 relative z-10 animate-fade-in" id="forgot_password_request_form">
            <div className="text-center space-y-1 pb-2">
              <Key className="w-10 h-10 text-rose-500 mx-auto mb-2 animate-bounce animate-pulse" />
              <h3 className="text-white font-bold text-base">Quên Mật Khẩu?</h3>
              <p className="text-xs text-slate-400 leading-relaxed px-2">
                Đừng lo lắng! Hãy nhập tên đăng nhập hoặc email của bạn. Chúng tôi sẽ khởi tạo mã OTP đặt lại mật khẩu của bạn ngay.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Tên tài khoản hoặc Email
              </label>
              <input
                type="text"
                required
                placeholder="Nhập username hoặc email của bạn..."
                value={resetUser}
                onChange={(e) => setResetUser(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 text-white rounded-xl py-3 px-4 focus:outline-none focus:border-indigo-500 text-sm transition"
                id="forgot_input_user"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl py-3.5 font-semibold text-sm transition shadow-lg cursor-pointer"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : 'Gửi mã OTP vào Email 📩'}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setForgotMode('none')}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold hover:underline transition cursor-pointer"
              >
                Quay lại màn hình Đăng nhập
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-5 relative z-10 animate-fade-in" id="forgot_password_reset_form">
            <div className="text-center space-y-1 pb-2">
              <Shield className="w-10 h-10 text-emerald-500 mx-auto mb-2 animate-pulse" />
              <h3 className="text-white font-bold text-base">Nhập Mã Xác Minh</h3>
              <p className="text-xs text-slate-400 px-2 leading-relaxed">
                Hệ thống đã gửi một email chứa mã xác minh OTP gồm 6 chữ số tới địa chỉ Email của bạn. Hãy kiểm tra hòm thư và điền mã dưới đây:
              </p>
            </div>

            {etherealUrl && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs p-4 rounded-xl space-y-2.5 animate-pulse leading-relaxed">
                <div className="font-bold flex items-center gap-1.5 text-emerald-400">
                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span>📬 HÒM THƯ EMAIL THỰC TẾ</span>
                </div>
                <p>Do máy chủ được khởi tạo ở chế độ phát triển (AI Studio Sandbox), thư điện tử thật đã được gửi thành công qua máy chủ test <strong>Ethereal Email</strong>.</p>
                <div className="pt-1">
                  <a
                    href={etherealUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold px-3.5 py-2 rounded-xl text-[11px] transition shadow-md active:scale-95"
                  >
                    <span>Mở Email Nhận Thư Thực Tế 📬</span>
                  </a>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Mã xác minh OTP (6 chữ số)
              </label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="000000"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                className="w-full text-center bg-slate-950 border border-slate-800 text-white rounded-xl py-3 font-mono text-xl tracking-widest focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                id="forgot_input_code"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Mật khẩu mới
              </label>
              <input
                type="password"
                required
                placeholder="Nhập mật khẩu mới từ 6 ký tự..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 focus:outline-none focus:border-indigo-500 text-sm focus:ring-1 focus:ring-indigo-500"
                id="forgot_input_newpwd"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl py-3.5 font-semibold text-sm transition shadow-lg cursor-pointer hover:scale-[1.01]"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : 'Xác nhận Đổi Mật Khẩu'}
            </button>

            <div className="flex justify-between items-center pt-2 text-xs">
              <button
                type="button"
                onClick={() => setForgotMode('request')}
                className="text-indigo-400 hover:text-indigo-300 hover:underline transition cursor-pointer"
              >
                Gửi lại mã OTP khác
              </button>
              <button
                type="button"
                onClick={() => setForgotMode('none')}
                className="text-slate-400 hover:text-white hover:underline transition cursor-pointer"
              >
                Quay lại Đăng nhập
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Backend API Configuration Panel */}
      <div className="mt-5 text-center relative z-10" id="backend_config_wrapper">
        <button
          type="button"
          onClick={() => setShowBackendConfig(!showBackendConfig)}
          className="text-slate-500 hover:text-slate-300 text-[11px] transition inline-flex items-center gap-1 hover:underline cursor-pointer"
          id="toggle_backend_config_btn"
        >
          <span>⚙️ Cấu hình địa chỉ máy chủ ZNet (Cloudflare Pages/VPS)</span>
        </button>

        {showBackendConfig && (
          <div className="mt-3 bg-slate-900/95 border border-slate-800 rounded-2xl p-5 text-left shadow-xl animate-fade-in text-slate-300" id="backend_config_panel">
            <h4 className="text-slate-100 font-bold text-xs mb-1.5 flex items-center gap-1.5">
              <span>⚙️ Liên kết Máy chủ Backend</span>
            </h4>
            <p className="text-[10px] text-slate-400 mb-3.5 leading-normal">
              Nếu bạn đang lưu trữ Giao diện (Frontend) trên Cloudflare Pages độc lập, hãy nhập địa chỉ URL của VPS Node.js Backend của bạn để liên kết dữ liệu và kết nối WebSocket:
            </p>

            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ví dụ: znet-backend.yourdomain.com hoặc 123.45.67.89:3000"
                  value={backendUrlInput}
                  onChange={(e) => setBackendUrlInput(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  id="backend_url_input_field"
                />
                <button
                  type="button"
                  onClick={testBackendConnection}
                  disabled={testStatus === 'testing'}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer"
                  id="test_backend_url_btn"
                >
                  {testStatus === 'testing' ? 'Đang thử...' : 'Kiểm tra'}
                </button>
                <button
                  type="button"
                  onClick={saveBackendUrl}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
                  id="save_backend_url_btn"
                >
                  Lưu
                </button>
              </div>

              {testStatus !== 'idle' && (
                <div className={`text-[10px] p-2.5 rounded-lg border leading-relaxed ${
                  testStatus === 'success' 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                    : testStatus === 'testing' 
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse' 
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`} id="connection_test_result">
                  {testStatus === 'success' && <span>🟢 {testResultMsg}</span>}
                  {testStatus === 'testing' && <span>⏳ Đang gửi tín hiệu ping kiểm tra kết nối đến máy chủ...</span>}
                  {testStatus === 'error' && (
                    <div className="space-y-1">
                      <span className="font-semibold block">🔴 Lỗi kết nối:</span>
                      <p>{testResultMsg}</p>
                    </div>
                  )}
                </div>
              )}

              {localStorage.getItem('znet_backend_url') ? (
                <div className="text-[10px] text-indigo-400 flex justify-between items-center bg-indigo-500/5 px-2.5 py-1.5 rounded-lg border border-indigo-500/10">
                  <span className="truncate max-w-[240px]">Đang dùng: {localStorage.getItem('znet_backend_url')}</span>
                  <button
                    type="button"
                    onClick={clearBackendUrl}
                    className="text-rose-400 hover:text-rose-300 font-semibold shrink-0 cursor-pointer"
                    id="clear_backend_url_btn"
                  >
                    Xóa & Reset
                  </button>
                </div>
              ) : (
                <div className="text-[10px] text-slate-500 bg-slate-950 px-2.5 py-1.5 rounded-lg text-center border border-slate-900">
                  Mặc định: Sử dụng máy chủ hiện tại ({typeof window !== 'undefined' ? window.location.origin : ''})
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
