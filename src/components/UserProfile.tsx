/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, Shield, ShieldCheck, Key, ShieldAlert, Sparkles, Check, CheckCircle2 } from 'lucide-react';
import { User as UserType } from '../types';

interface UserProfileProps {
  token: string;
  user: UserType;
  onProfileUpdate: (updatedUser: Partial<UserType>) => void;
  onLogout: () => void;
}

export default function UserProfile({ token, user, onProfileUpdate, onLogout }: UserProfileProps) {
  // Profile settings
  const [statusText, setStatusText] = useState<string>(user.status);
  const [selectedAvatar, setSelectedAvatar] = useState<string>(user.avatar);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [profileMsg, setProfileMsg] = useState<string>('');
  const [profileError, setProfileError] = useState<string>('');

  // 2FA Setup state flow
  const [isSettingUp2FA, setIsSettingUp2FA] = useState<boolean>(false);
  const [twoFactorSecret, setTwoFactorSecret] = useState<string>('');
  const [qrContent, setQrContent] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [twoFactorMsg, setTwoFactorMsg] = useState<string>('');
  const [twoFactorError, setTwoFactorError] = useState<string>('');

  // 2FA Teardown state flow
  const [isDisabling2FA, setIsDisabling2FA] = useState<boolean>(false);

  // Password change states
  const [showPasswordChange, setShowPasswordChange] = useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [pwdMsg, setPwdMsg] = useState<string>('');
  const [pwdError, setPwdError] = useState<string>('');
  const [isUpdatingPwd, setIsUpdatingPwd] = useState<boolean>(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg('');
    setPwdError('');

    if (newPassword !== confirmPassword) {
      setPwdError('Mật khẩu xác nhận không trùng khớp!');
      return;
    }

    if (newPassword.length < 6) {
      setPwdError('Mật khẩu mới phải dài tối thiểu 6 ký tự!');
      return;
    }

    setIsUpdatingPwd(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Thay đổi mật khẩu thất bại!');
      }

      setPwdMsg('Thay đổi mật khẩu của bạn thành công!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwdMsg(''), 4000);
    } catch (err: any) {
      setPwdError(err.message || 'Lỗi khi kết nối đổi mật khẩu máy chủ');
    } finally {
      setIsUpdatingPwd(false);
    }
  };

  const avatarsList = [
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Felix',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Jack',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Cookie',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Buster',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Milo',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Gizmo',
    'https://api.dicebear.com/7.x/pixel-art/svg?seed=Jasper'
  ];

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileError('');
    setIsUpdating(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: statusText,
          avatar: selectedAvatar
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Cập nhật tài khoản thất bại');
      }

      setProfileMsg('Cập nhật hồ sơ tài khoản cá nhân thành công!');
      // Dispatch update to global state
      onProfileUpdate({
        status: statusText,
        avatar: selectedAvatar
      });
      setTimeout(() => setProfileMsg(''), 3000);
    } catch (err: any) {
      setProfileError(err.message || 'Lỗi cập nhật ảnh đại diện/trạng thái');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleGenerate2FA = async () => {
    setTwoFactorError('');
    setTwoFactorMsg('');
    try {
      const res = await fetch('/api/auth/2fa/generate', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể tạo mã bí mật');
      
      setTwoFactorSecret(data.secret);
      setQrContent(data.qrContent);
      setIsSettingUp2FA(true);
    } catch (err: any) {
      setTwoFactorError(err.message || 'Gặp sự cố khi khởi tạo 2FA.');
    }
  };

  const verifyAndEnable2FA = async () => {
    setTwoFactorError('');
    setTwoFactorMsg('');
    const cleanOtp = otpCode.trim();
    if (!cleanOtp) {
      setTwoFactorError('Dữ liệu OTP không được để trống!');
      return;
    }
    if (/[a-zA-Z]/.test(cleanOtp)) {
      setTwoFactorError('Mã xác thực OTP chứa chữ cái. Đây có thể là mã khóa bí mật. Bạn phải quét mã QR này vào ứng dụng Authenticator (Google/Microsoft) và nhập mã số 6 chữ số sinh ra từ ứng dụng!');
      return;
    }
    if (cleanOtp.length !== 6) {
      setTwoFactorError('Mã xác thực OTP phải có độ dài chính xác là 6 số!');
      return;
    }

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ otp: cleanOtp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Mã xác nhận bảo mật OTP không chính xác');

      setTwoFactorMsg('Đã kích hoạt bảo mật 2FA Authenticator thành công!');
      onProfileUpdate({ twoFactorEnabled: true });
      // Reset state setup
      setIsSettingUp2FA(false);
      setOtpCode('');
      setTwoFactorSecret('');
    } catch (err: any) {
      setTwoFactorError(err.message || 'Đồng bộ 2FA thất bại.');
    }
  };

  const disable2FA = async () => {
    setTwoFactorError('');
    setTwoFactorMsg('');
    const cleanOtp = otpCode.trim();
    if (!cleanOtp) {
      setTwoFactorError('Vui lòng nhập mã OTP để tắt bảo mật.');
      return;
    }
    if (/[a-zA-Z]/.test(cleanOtp)) {
      setTwoFactorError('Mã OTP xác thực không chứa chữ cái. Hãy nhập 6 số từ ứng dụng Authenticator ứng với tài khoản của bạn!');
      return;
    }
    if (cleanOtp.length !== 6) {
      setTwoFactorError('Mã OTP 6 chữ số để xác thực việc huỷ bảo mật phải có đúng 6 số!');
      return;
    }

    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ otp: cleanOtp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Mã OTP huỷ kích hoạt không đúng');

      setTwoFactorMsg('Đã tắt chế độ bảo mật hai lớp tài khoản của bạn.');
      onProfileUpdate({ twoFactorEnabled: false });
      setIsDisabling2FA(false);
      setOtpCode('');
    } catch (err: any) {
      setTwoFactorError(err.message || 'Huỷ kích hoạt bảo mật thất bại.');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-8 h-full overflow-y-auto" id="user_profile_container">
      {/* Upper header */}
      <div className="flex items-center gap-4 border-b border-slate-800/80 pb-5">
        <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/15">
          <Shield className="w-6 h-6" id="profile_icon_badge" />
        </div>
        <div>
          <h3 className="text-lg font-bold font-sans text-white">Cài đặt Bảo mật & Cá nhân</h3>
          <p className="text-xs text-slate-400">Quản lý bảo mật tài khoản nâng cao, đổi mật khẩu và cập nhật hồ sơ cá nhân</p>
        </div>
      </div>

      {profileMsg && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 text-xs animate-fade-in" id="profile_success_toast">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{profileMsg}</span>
        </div>
      )}

      {profileError && (
        <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-xs animate-fade-in" id="profile_err_toast">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{profileError}</span>
        </div>
      )}

      {/* Main Setting layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Tab 1: Personal profile */}
        <div className="space-y-5" id="profile_details_tab">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Thông tin cá nhân</h4>
          
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Tên tài khoản</label>
              <input
                type="text"
                disabled
                value={user.username}
                className="w-full bg-slate-950/40 border border-slate-800 text-slate-400 rounded-xl py-2.5 px-4 text-xs cursor-not-allowed font-medium"
              />
              <span className="text-[10px] text-slate-550 mt-1 block">Tên người dùng được gán vĩnh viễn trên ZNet và không thể chỉnh sửa.</span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Lời giới thiệu trạng thái (Bio)</label>
              <input
                type="text"
                required
                maxLength={100}
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="Ví dụ: Hi there! I am using ZNet!"
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-4 text-xs focus:outline-none focus:border-indigo-500 transition"
                id="profile_status_input"
              />
            </div>

            {/* Select avatar options */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Thay đổi ảnh đại diện</label>
              <div className="grid grid-cols-4 gap-2.5 pt-1">
                {avatarsList.map((avatarUrl, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setSelectedAvatar(avatarUrl)}
                    className={`relative rounded-xl overflow-hidden border p-1 bg-slate-950/40 opacity-75 hover:opacity-100 transition aspect-square flex items-center justify-center cursor-pointer ${
                      selectedAvatar === avatarUrl ? 'border-indigo-500 ring-2 ring-indigo-500/20 opacity-100 scale-103' : 'border-slate-850'
                    }`}
                  >
                    <img referrerPolicy="no-referrer" src={avatarUrl} alt="Avatar spec" className="w-full h-full object-cover rounded-lg" />
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isUpdating}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs py-2.5 px-5 rounded-xl transition cursor-pointer hover:scale-102 flex items-center gap-2 shadow-md"
              id="profile_details_submit_btn"
            >
              {isUpdating ? 'Vui lòng chờ...' : 'Lưu Thay Đổi'}
            </button>
          </form>

          {/* Section: Change Password */}
          <div className="bg-slate-950/20 p-5 rounded-2xl border border-slate-800/50 space-y-4" id="profile_password_section">
            <button
              onClick={() => setShowPasswordChange(!showPasswordChange)}
              className="flex items-center justify-between w-full text-left cursor-pointer group"
              type="button"
            >
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider group-hover:text-indigo-400 transition">
                  Thay đổi mật khẩu tài khoản
                </h4>
              </div>
              <span className="text-[11px] text-indigo-400 font-medium hover:underline">
                {showPasswordChange ? 'Thu gọn ▲' : 'Đổi mật khẩu ▼'}
              </span>
            </button>

            {showPasswordChange && (
              <form onSubmit={handleChangePassword} className="space-y-3.5 pt-2 animate-fade-in">
                {pwdMsg && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-2.5 rounded-xl flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{pwdMsg}</span>
                  </div>
                )}
                {pwdError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-2.5 rounded-xl flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{pwdError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Nhập mật khẩu đang dùng"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Mật khẩu mới</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mật khẩu mới từ 6 ký tự"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Xác nhận mật khẩu mới</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingPwd}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs py-2 px-4 rounded-xl transition cursor-pointer shadow-md"
                >
                  {isUpdatingPwd ? 'Đang cập nhật mật khẩu...' : 'Xác Nhận Đổi Mật Khẩu'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Tab 2: Security Settings */}
        <div className="bg-slate-950/40 p-5 rounded-3xl border border-slate-800/60 space-y-5" id="profile_2fa_tab">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-indigo-400" /> Cài đặt Xác thực hai bước (2FA)
            </h4>
            
            {user.twoFactorEnabled ? (
              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-lg px-2 py-0.5">
                <ShieldCheck className="w-3 h-3" /> Đang bảo vệ
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/25 rounded-lg px-2 py-0.5">
                <ShieldAlert className="w-3 h-3" /> Chưa kích hoạt
              </span>
            )}
          </div>

          {twoFactorMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-xl">
              {twoFactorMsg}
            </div>
          )}

          {twoFactorError && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-xl">
              {twoFactorError}
            </div>
          )}

          {!user.twoFactorEnabled ? (
            !isSettingUp2FA ? (
              <div className="space-y-3">
                <p className="text-slate-400 text-xs leading-relaxed">
                  Xác minh hai bước qua ứng dụng xác thực (2FA) bảo vệ tuyệt đối tài khoản ZNet của bạn. Sau khi kích hoạt, mỗi lần đăng nhập hệ thống sẽ yêu cầu mã xác minh phát sinh từ ứng dụng xác minh (Google Authenticator, Microsoft Authenticator) trên thiết bị của bạn.
                </p>
                <button
                  type="button"
                  onClick={handleGenerate2FA}
                  className="w-full bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-450 text-white font-semibold text-xs py-2.5 px-4 rounded-xl transition cursor-pointer shadow-md hover:scale-[1.01]"
                  id="profile_btn_setup_2fa"
                >
                  Kích Hoạt Xác Minh Hai Bước
                </button>
              </div>
            ) : (
              <div className="space-y-4 animate-fade-in" id="profile_setup_2fa_step2">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Bước 1: Quét mã hoặc nhập khoá</span>
                  <p className="text-[10px] text-slate-400">
                    Sử dụng Google Authenticator hoặc Microsoft Authenticator tải từ Appstore/CHPlay của bạn:
                  </p>
                  
                  {/* Visual QR simulation with clean border */}
                  <div className="flex flex-col items-center justify-center p-3.5 bg-slate-950 border border-indigo-500/15 rounded-xl text-center space-y-2">
                    <div className="p-2 border border-slate-800 bg-white rounded-lg">
                      {/* Generates placeholder with real information */}
                      <img
                        referrerPolicy="no-referrer"
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrContent)}`}
                        alt="2FA QR Code"
                        className="w-28 h-28 object-contain shrink-0"
                      />
                    </div>
                    <span className="text-[9px] text-slate-400">Hoặc tự nhập mã khoá thủ công:</span>
                    <code className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded select-all font-semibold letter-spacing-1">{twoFactorSecret}</code>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Bước 2: Xác nhận mã bảo mật từ ứng dụng</span>
                  <input
                    type="text"
                    maxLength={32}
                    placeholder="Nhập mã 6 chữ số (VD: 123456)"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="w-full text-center bg-slate-950 border border-slate-800 text-white rounded-xl py-2 font-mono text-lg tracking-widest focus:outline-none focus:border-indigo-500"
                  />
                  {/[a-zA-Z]/.test(otpCode) && (
                    <p className="text-amber-400 text-[10px] mt-1 text-left bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 leading-relaxed font-sans">
                      ⚠️ <strong>Phát hiện chữ cái!</strong> Bạn đang nhập chuỗi khóa bí mật. Bạn phải quét mã QR hoặc nhập khóa thủ công vào ứng dụng xác thực trên điện thoại của mình, sau đó nhập mã số gồm <strong>6 chữ số sinh ra tự động</strong> từ ứng dụng!
                    </p>
                  )}
                  <div className="flex gap-2.5">
                    <button
                      onClick={verifyAndEnable2FA}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2 px-3 rounded-lg transition cursor-pointer"
                    >
                      Kích nhận hoạt động
                    </button>
                    <button
                      onClick={() => setIsSettingUp2FA(false)}
                      className="bg-slate-800 hover:bg-slate-755 text-slate-300 font-semibold text-xs py-2 px-3 rounded-lg transition cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-4">
              {!isDisabling2FA ? (
                <div className="space-y-3">
                  <p className="text-slate-400 text-xs text-justify leading-relaxed">
                    Xác minh hai bước qua ứng dụng xác thực (2FA) đang hoạt động bảo vệ tối ưu tài khoản của bạn.
                  </p>
                  <button
                    onClick={() => setIsDisabling2FA(true)}
                    className="w-full bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 font-semibold text-xs py-2.5 px-4 rounded-xl transition cursor-pointer"
                  >
                    Hủy kích hoạt xác minh 2FA
                  </button>
                </div>
              ) : (
                <div className="bg-rose-500/5 p-4 rounded-2xl border border-rose-500/10 space-y-3 animate-fade-in">
                  <label className="block text-[10px] font-semibold text-rose-400 uppercase tracking-wider">Nhập mã ứng dụng để tắt xác minh</label>
                  <input
                    type="text"
                    maxLength={32}
                    placeholder="Mã số 6 chữ số..."
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="w-full text-center bg-slate-950 border border-slate-800 text-white rounded-xl py-2 font-mono text-base tracking-widest focus:outline-none"
                  />
                  {/[a-zA-Z]/.test(otpCode) && (
                    <p className="text-amber-400 text-[10px] mt-1 text-left bg-amber-500/10 p-2 rounded-xl border border-amber-500/15 leading-relaxed font-sans">
                      ⚠️ <strong>Phát hiện chữ cái!</strong> Mã xác thực ngẫu nhiên từ ứng dụng của bạn chỉ bao gồm 6 chữ số tự động!
                    </p>
                  )}
                  <div className="flex gap-2.5">
                    <button
                      onClick={disable2FA}
                      className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs py-2 rounded-lg cursor-pointer"
                    >
                      Xác Nhận Hủy
                    </button>
                    <button
                      onClick={() => {
                        setIsDisabling2FA(false);
                        setOtpCode('');
                      }}
                      className="bg-slate-800 hover:bg-slate-755 text-slate-300 font-semibold text-xs py-2 rounded-lg cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Logout button */}
      <div className="pt-6 border-t border-slate-800/80 text-right">
        <button
          onClick={onLogout}
          className="text-xs bg-slate-950 hover:bg-slate-910 shrink-0 text-slate-400 hover:text-rose-400 border border-slate-850 px-5 py-2.5 rounded-xl cursor-pointer transition uppercase tracking-wider font-semibold"
          id="profile_logout_btn"
        >
          Đăng xuất tài khoản
        </button>
      </div>
    </div>
  );
}
