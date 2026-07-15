/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileText, 
  ShieldAlert, 
  CheckCircle, 
  ExternalLink, 
  RefreshCw, 
  FileCode, 
  Star, 
  Folder, 
  Download, 
  Cloud, 
  HardDrive, 
  Info,
  Copy,
  Terminal,
  Zap
} from 'lucide-react';
import { User } from '../types';

interface ExportDocsSectionProps {
  token: string;
  user: User;
}

type ExportType = 'google_drive' | 'google_docs';

export default function ExportDocsSection({ token, user }: ExportDocsSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState<ExportType>('google_drive');
  const [accessTokenInput, setAccessTokenInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);
  
  // Custom states for copying and downloading znet_design.html directly through JSON API to bypass Cloudflare Tunnel redirections
  const [isCopyingDesign, setIsCopyingDesign] = useState<boolean>(false);
  const [copiedDesignSuccess, setCopiedDesignSuccess] = useState<boolean>(false);
  const [isDownloadingDesign, setIsDownloadingDesign] = useState<boolean>(false);
  const [copiedVpsSuccess, setCopiedVpsSuccess] = useState<boolean>(false);
  
  const [successInfo, setSuccessInfo] = useState<{ 
    url: string; 
    title: string; 
    id: string; 
    type: 'drive' | 'docs' 
  } | null>(null);
  
  const [errorMsg, setErrorMsg] = useState<string>('');

  // 1. Download packed .ZIP source code directly to local storage
  const handleDownloadZip = async () => {
    try {
      setIsDownloadingZip(true);
      setErrorMsg('');
      setSuccessInfo(null);

      const res = await fetch('/api/export/zip', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error('Đóng gói & tải file ZIP từ máy chủ thất bại.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `znet_source_code_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Lỗi hệ thống khi tải file ZIP.');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // 2. Export / Upload handler (Both Google Docs and Google Drive ZIPs)
  const handleCloudExport = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = accessTokenInput.trim();
    if (!cleanToken) {
      setErrorMsg('Vui lòng cung cấp Google OAuth Access Token để thực hiện sao lưu.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg('');
      setSuccessInfo(null);

      const endpoint = activeSubTab === 'google_docs' ? '/api/export/google-docs' : '/api/export/google-drive';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ googleAccessToken: cleanToken })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Đóng gói hoặc sao lưu lên đám mây thất bại.');
      }

      setSuccessInfo({
        url: data.docUrl,
        title: data.title,
        id: data.documentId || data.fileId || '',
        type: activeSubTab === 'google_docs' ? 'docs' : 'drive'
      });
      setAccessTokenInput('');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Lỗi giao dịch thiết lập hoặc phân quyền Access Token không khớp.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Copy znet_design.html content directly through json back-end path
  const handleCopyDesignContent = async () => {
    try {
      setIsCopyingDesign(true);
      setErrorMsg('');
      setSuccessInfo(null);
      const res = await fetch('/api/export/znet-design', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error('Sự cố tải mã nguồn thiết kế từ máy chủ. Hãy khởi động lại dự án hoặc kiểm tra log hoặc phân quyền.');
      }
      const data = await res.json();
      if (data && data.html) {
        await navigator.clipboard.writeText(data.html);
        setCopiedDesignSuccess(true);
        setTimeout(() => setCopiedDesignSuccess(false), 3500);
      } else {
        throw new Error('Máy chủ trả về kết quả rỗng cho mã nguồn thiết kế.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Lỗi bất định khi sao chép tệp HTML thiết kế.');
    } finally {
      setIsCopyingDesign(false);
    }
  };

  // 4. Download znet_design.html directly through JSON endpoint bypass static rule redirect
  const handleDownloadDesignContent = async () => {
    try {
      setIsDownloadingDesign(true);
      setErrorMsg('');
      setSuccessInfo(null);
      const res = await fetch('/api/export/znet-design', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error('Đường truyền tải tệp thiết kế từ API xảy ra sự cố.');
      }
      const data = await res.json();
      if (data && data.html) {
        const blob = new Blob([data.html], { type: 'text/html;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'znet_design.html';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        throw new Error('Tệp tải xuống trống rỗng không mong muốn.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Lỗi bất định khi tải file HTML thiết kế.');
    } finally {
      setIsDownloadingDesign(false);
    }
  };

  const handleCopyVpsCmd = () => {
    const origin = window.location.origin;
    const cmd = `curl -sLO ${origin}/api/sync/znet-patcher.sh && bash znet-patcher.sh`;
    navigator.clipboard.writeText(cmd);
    setCopiedVpsSuccess(true);
    setTimeout(() => {
      setCopiedVpsSuccess(false);
    }, 2500);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col h-full overflow-y-auto" id="export_docs_outer_section">
      {/* Header section with branding */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800/85 pb-5 mb-6 shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/15">
            <Folder className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold font-sans text-white">Xuất & Sao Lưu Mã Nguồn ZNet</h3>
            <p className="text-[10px] text-slate-400">Tải tệp ZIP gốc hoặc tự động tải mã nguồn đầy đủ lên bộ nhớ đám mây của riêng bạn</p>
          </div>
        </div>

        {/* Instantly Download Local ZIP Component */}
        <button
          onClick={handleDownloadZip}
          disabled={isDownloadingZip}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md select-none"
          id="btn_download_zip_local"
        >
          {isDownloadingZip ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Tải file ZIP Mã Nguồn
        </button>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 text-xs rounded-2xl flex items-center gap-2 mb-5 shrink-0 animate-fade-in" id="export_error_toast">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successInfo && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 p-5 rounded-2xl mb-6 shrink-0 animate-fade-in" id="export_success_card">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-white">
                {successInfo.type === 'drive' ? 'Lưu trữ tệp .ZIP lên Google Drive thành công!' : 'Tạo tài liệu Google Docs thành công!'}
              </h4>
              <p className="text-[10.5px] text-slate-300 mt-1 leading-relaxed">
                Tệp tin dự án mang tên <strong className="text-emerald-400">"{successInfo.title}"</strong> đã được tải lên trực tiếp tài khoản Google của bạn thành công.
              </p>
              
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <a
                  href={successInfo.url}
                  target="_blank"
                  referrerPolicy="no-referrer"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer shadow-md"
                >
                  Mở {successInfo.type === 'drive' ? 'Google Drive' : 'Google Docs'} <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <div className="p-2 px-3 bg-slate-950/60 rounded-xl border border-slate-850 text-[10px] font-mono text-slate-400 tracking-wider">
                  Mã ID: {successInfo.id}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Exporter Control Panel */}
        <div className="lg:col-span-7 bg-slate-950/40 border border-slate-850 rounded-2xl p-5 space-y-5">
          
          {/* Sub-tabs for cloud options */}
          <div className="flex items-center gap-2 border-b border-slate-850/70 pb-3">
            <button
              onClick={() => {
                setActiveSubTab('google_drive');
                setSuccessInfo(null);
                setErrorMsg('');
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
                activeSubTab === 'google_drive'
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <HardDrive className="w-4 h-4" /> Sao Lưu (.ZIP) lên Google Drive
            </button>
            <button
              onClick={() => {
                setActiveSubTab('google_docs');
                setSuccessInfo(null);
                setErrorMsg('');
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
                activeSubTab === 'google_docs'
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode className="w-4 h-4" /> Xuất Văn Bản lên Google Docs
            </button>
          </div>

          <form onSubmit={handleCloudExport} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                Google APIs OAuth 2.0 Access Token
              </label>
              <textarea
                rows={4}
                required
                placeholder={
                  activeSubTab === 'google_drive'
                    ? "Dán Google Access Token của bạn (Có quyền scope: https://www.googleapis.com/auth/drive.file để tạo và tải tệp .zip lên Drive)..."
                    : "Dán Google Access Token của bạn (Có quyền scope: https://www.googleapis.com/auth/documents để ghi văn bản vào tài liệu mới)..."
                }
                value={accessTokenInput}
                onChange={(e) => setAccessTokenInput(e.target.value)}
                className="w-full text-xs text-white bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-3.5 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !accessTokenInput.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 text-white rounded-xl py-3 text-xs font-semibold hover:scale-[1.01] active:scale-100 transition cursor-pointer flex items-center justify-center gap-2 shadow-md"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Đang chuẩn bị gói mã nguồn & liên kết dịch vụ Google...
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4 animate-bounce" /> 
                  {activeSubTab === 'google_drive' ? 'SAO LƯU ZIP LÊN GOOGLE DRIVE' : 'GỬI MÃ NGUỒN LÊN GOOGLE DOCS'}
                </>
              )}
            </button>
          </form>

          {/* Code Files Included Summary */}
          <div className="border-t border-slate-850 pt-4" id="export_files_summary_sub">
            <span className="text-[9.5px] uppercase font-semibold text-slate-500 block mb-2">
              Các file & thư mục được đóng gói (Bảo lưu toàn bộ mã nguồn):
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                'index.html', 'package.json', 'server.ts', 'tsconfig.json', 'vite.config.ts', 
                '.env.example', '.gitignore', 'src/types.ts', 'src/App.tsx', 'src/main.tsx',
                'src/components/*', 'src/lib/*'
              ].map(f => (
                <span key={f} className="text-[10px] bg-slate-900 border border-slate-850 text-slate-400 px-2 py-1 rounded-md font-mono select-none">
                  {f}
                </span>
              ))}
            </div>
            <div className="mt-3 text-[10px] text-slate-500 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>Tự động loại bỏ dữ liệu sqlite `social.db`, `node_modules` và file rác để đảm bảo file nhẹ và an toàn.</span>
            </div>
          </div>
        </div>

        {/* Right Side: Step-by-Step Instructions */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-5 space-y-3.5">
            <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 uppercase tracking-wide">
              <Star className="w-4 h-4 fill-indigo-400/20" /> Quy trình lấy Access Token trong 60 giây
            </h4>
            
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Nhằm đảm bảo an toàn, hệ thống tuyệt đối không hỏi mật khẩu của bạn. Hãy tạo một chuỗi mã xác thực Access Token tạm thời bằng hướng dẫn cực kỳ nhanh gọn sau:
            </p>

            <ol className="space-y-3 text-[11px] text-slate-300 list-decimal pl-4 leading-relaxed">
              <li>
                <div className="font-semibold text-slate-100 flex items-center gap-1">
                  Bước 1: Truy cập Google OAuth Playground
                  <a
                    href="https://developers.google.com/oauthplayground/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </li>
              <li>
                Bước 2: Tìm kiếm ở danh mục bên trái và click chọn API tương ứng:
                <div className="bg-slate-950 p-2 rounded-xl mt-1.5 space-y-1.5 border border-slate-850 text-[10.5px]">
                  {activeSubTab === 'google_drive' ? (
                    <>
                      <div className="text-indigo-400 font-semibold flex items-center gap-1">
                        <HardDrive className="w-3.5 h-3.5" /> Dành cho Google Drive BACKUP:
                      </div>
                      <p className="text-[10px] text-slate-400">Chọn <strong>Drive API v3</strong>, rồi tick chọn scope cực kỳ gọn nhẹ:</p>
                      <div className="bg-slate-900 border border-slate-850 p-1.5 rounded text-[9.5px] font-mono break-all select-all text-slate-300">
                        https://www.googleapis.com/auth/drive.file
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-indigo-400 font-semibold flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> Dành cho Google Docs TEXT EXPORT:
                      </div>
                      <p className="text-[10px] text-slate-400">Chọn <strong>Google Docs API v1</strong>, rồi tick chọn scope:</p>
                      <div className="bg-slate-900 border border-slate-850 p-1.5 rounded text-[9.5px] font-mono break-all select-all text-slate-300">
                        https://www.googleapis.com/auth/documents
                      </div>
                    </>
                  )}
                </div>
              </li>
              <li>
                Bước 3: Bấm nút xanh <strong className="text-indigo-450 border border-indigo-505/20 px-1 rounded">Authorize APIs</strong> và chọn tài khoản Google của bạn để xác nhận (popup hiện ra).
              </li>
              <li>
                Bước 4: Tại màn hình kế tiếp, bấm nút xanh <strong className="text-emerald-450 border border-emerald-505/20 px-1 rounded">Exchange authorization code for tokens</strong>.
              </li>
              <li>
                Bước 5: Một ô chữ dài mang tên <strong className="text-white">"Access Token"</strong> sẽ hiện ra ở góc trái. Hãy sao chép chuỗi ký tự đó dán vào khung bên cạnh để tiến hành sao lưu!
              </li>
            </ol>
            
            <div className="text-[10px] text-slate-500 italic mt-2 flex items-center gap-1.5 border-t border-indigo-500/10 pt-2.5">
              <Folder className="w-3.5 h-3.5" />
              <span>Token này sẽ tự hủy an toàn trên hệ thống Google sau 60 phút.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Vượt rào cản Cloudflare Tunnel - Sao chép / Tải file thiết kế hợp nhất trực tiếp từ Backend JSON */}
      <div className="mt-8 pt-6 border-t border-slate-800/80" id="bypass_cloudflare_section">
        <div className="bg-gradient-to-r from-indigo-950/40 to-slate-950/40 border border-indigo-500/15 rounded-3xl p-5 md:p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/10">
                Giải Pháp Localhost & Cloudflare Tunnel
              </span>
              <h4 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                <FileCode className="w-4 h-4 text-indigo-400 animate-pulse" />
                Sao Chép & Tải File Thiết Kế Đồng Bộ <code className="text-indigo-300 font-mono text-xs bg-slate-950 px-1.5 py-0.5 rounded">znet_design.html</code>
              </h4>
              <p className="text-[11.5px] text-slate-300 leading-relaxed max-w-3xl">
                Khi sử dụng <strong className="text-indigo-400 font-semibold">Cloudflare Tunnel (miễn phí, URL ngẫu nhiên)</strong> trỏ về cổng <code className="text-indigo-300 bg-slate-900 border border-slate-850 px-1 rounded font-mono text-[10.5px]">localhost:3000</code>, máy chủ proxy hoặc cấu hình Single Page Application có thể chuyển hướng sai các file tĩnh <code className="text-indigo-300 font-mono">.html</code> về trang chủ dẫn đến lỗi <code className="text-rose-400 bg-rose-950/40 border border-rose-950/55 px-1 rounded font-mono text-[10px]">Unexpected token '&lt;'</code>. 
                <br />
                Hãy dùng <strong>2 công cụ API độc quyền</strong> bên dưới để lấy nội dung thô 100% chính xác của trang thiết kế hợp nhất mà không bao giờ bị dính lỗi định hướng:
              </p>
            </div>

            <div className="flex flex-row md:flex-col lg:flex-row gap-3 min-w-[240px] shrink-0">
              <button
                onClick={handleCopyDesignContent}
                disabled={isCopyingDesign}
                className={`flex-1 md:w-full lg:flex-1 py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md select-none ${
                  copiedDesignSuccess 
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50'
                }`}
                id="btn_copy_design_html"
              >
                {isCopyingDesign ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : copiedDesignSuccess ? (
                  <CheckCircle className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedDesignSuccess ? 'Đã Sao Chép HTML!' : 'Sao Chép File HTML'}
              </button>

              <button
                onClick={handleDownloadDesignContent}
                disabled={isDownloadingDesign}
                className="flex-1 md:w-full lg:flex-1 bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50 py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer border border-slate-700 shadow-md select-none"
                id="btn_download_design_html"
              >
                {isDownloadingDesign ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Tải File HTML Thiết Kế
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center gap-1.5 text-[10.5px] text-slate-400">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Mẹo: Bạn có thể dán trực tiếp đoạn mã vừa sao chép ở đây vào các mô hình AI khác như Claude/ChatGPT để họ chỉnh sửa, tiếp tục đồng bộ phong cách thiết kế một cách trọn vẹn nhất.</span>
          </div>

          {/* VPS Automatic One-Liner Sync Component */}
          <div className="mt-6 pt-5 border-t border-slate-800/60 bg-slate-950/30 p-4 rounded-2xl border border-indigo-500/10 space-y-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-500" />
              <h5 className="text-[12.5px] font-bold text-slate-200">
                Đồng Bộ Nhanh 100% Mã Nguồn Lên VPS Thật (/root/znet)
              </h5>
              <span className="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-500/20 animate-pulse">
                Sửa Lỗi JSON & Bypass Cloudflare
              </span>
            </div>
            
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Dán đoạn mã duy nhất này vào terminal VPS của bạn (đứng ở thư mục cài đặt dự án như <code className="text-[10px] bg-slate-900 border border-slate-850 inline-block px-1 rounded font-mono">/root/znet</code>) để tự động đồng bộ tất cả mã nguồn đã vá lỗi và chạy lại tiến trình PM2/Nohup chỉ trong vài giây:
            </p>

            <div className="relative flex items-center bg-slate-900 border border-slate-800/80 rounded-xl p-3">
              <code className="text-[11px] text-amber-400 font-mono break-all pr-12 select-all leading-relaxed">
                curl -sLO {window.location.origin}/api/sync/znet-patcher.sh && bash znet-patcher.sh
              </code>
              <button
                onClick={handleCopyVpsCmd}
                className={`absolute right-3 p-2 rounded-xl border transition shadow-sm ${
                  copiedVpsSuccess 
                    ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:text-emerald-300' 
                    : 'bg-slate-800 border-slate-700 hover:bg-slate-750 text-slate-300'
                }`}
                title="Sao chép toàn bộ dòng lệnh"
              >
                {copiedVpsSuccess ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {copiedVpsSuccess && (
              <p className="text-[10px] text-emerald-400 font-bold text-right animate-pulse">
                ✓ Đã sao chép! Hãy mở VPS, dán vào terminal và ấn Enter để hoàn tất!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
