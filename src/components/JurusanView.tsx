import React, { useState, useMemo, useRef } from 'react';
import { 
  Layers, 
  Search, 
  Upload, 
  Download, 
  RefreshCw, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Jurusan, AppConfig, GTKData, AppTheme } from '../types';
import { isUserRole } from '../utils/authUtils';
import { fetchJurusanFromSheet, syncAllJurusanDirectly } from '../services/sheetsSync';

interface JurusanViewProps {
  jurusanList: Jurusan[];
  onUpdateJurusan: (newList: Jurusan[]) => void;
  appConfig?: AppConfig;
  currentUser?: GTKData | null;
  theme?: AppTheme;
}

export const JurusanView: React.FC<JurusanViewProps> = ({
  jurusanList = [],
  onUpdateJurusan,
  appConfig,
  currentUser,
  theme
}) => {
  const isUser = isUserRole(currentUser);
  const isAdmin = !isUser;
  const isGlass = theme === 'aurora-glass';

  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal Impor State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedRows, setImportedRows] = useState<Jurusan[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter list berdasarkan pencarian (kode, program keahlian, atau konsentrasi keahlian)
  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return jurusanList;
    const q = searchTerm.toLowerCase().trim();
    return jurusanList.filter(item => 
      (item.kode && item.kode.toLowerCase().includes(q)) ||
      (item.programKeahlian && item.programKeahlian.toLowerCase().includes(q)) ||
      (item.konsentrasiKeahlian && item.konsentrasiKeahlian.toLowerCase().includes(q))
    );
  }, [jurusanList, searchTerm]);

  // Refresh data dari Google Sheets (sheet "jurusan")
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const freshData = await fetchJurusanFromSheet(appConfig?.webAppUrl, appConfig?.spreadsheetId, true);
      if (freshData && freshData.length > 0) {
        onUpdateJurusan(freshData);
        setNotification({
          type: 'success',
          message: `Berhasil memuat ${freshData.length} data jurusan dari Spreadsheet!`
        });
      } else {
        setNotification({
          type: 'success',
          message: 'Data jurusan sudah mutakhir.'
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err?.message || 'Gagal menyinkronkan data jurusan dari Google Sheets'
      });
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // Unduh Template Excel / Data Jurusan saat ini (Format: kode, Program_Keahlian, Konsentrasi_Keahlian)
  const handleDownloadTemplate = () => {
    const dataToExport = jurusanList.length > 0
      ? jurusanList.map(j => ({
          kode: String(j.kode || ''),
          Program_Keahlian: String(j.programKeahlian || ''),
          Konsentrasi_Keahlian: String(j.konsentrasiKeahlian || '')
        }))
      : [
          { kode: 'ULP', Program_Keahlian: 'Usaha Layanan Pariwisata', Konsentrasi_Keahlian: 'Usaha Layanan Wisata' },
          { kode: 'TJKT', Program_Keahlian: 'Teknik Jaringan Komputer dan Telekomunikasi', Konsentrasi_Keahlian: 'Teknik Komputer dan Jaringan' },
          { kode: 'Kuliner', Program_Keahlian: 'Kuliner', Konsentrasi_Keahlian: 'Kuliner' },
          { kode: 'AKL', Program_Keahlian: 'Akuntansi dan Keuangan Lembaga', Konsentrasi_Keahlian: 'Akuntansi' },
          { kode: 'PMS', Program_Keahlian: 'Pemasaran', Konsentrasi_Keahlian: 'Bisnis Retail' },
          { kode: 'MPLB', Program_Keahlian: 'Manajemen Perkantoran dan Layanan Bisnis', Konsentrasi_Keahlian: 'Manajemen Perkantoran' }
        ];

    const worksheet = XLSX.utils.json_to_sheet(dataToExport, {
      header: ['kode', 'Program_Keahlian', 'Konsentrasi_Keahlian']
    });

    // Set tipe teks untuk semua cell agar kode angka/huruf tidak diformat otomatis
    Object.keys(worksheet).forEach(cellKey => {
      if (cellKey.startsWith('!')) return;
      worksheet[cellKey].t = 's';
    });

    worksheet['!cols'] = [
      { wch: 15 }, // kode
      { wch: 45 }, // Program_Keahlian
      { wch: 45 }, // Konsentrasi_Keahlian
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'jurusan');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Data_Jurusan_${dateStr}.xlsx`);
  };

  // Membaca file Excel yang dipilih oleh Admin
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        // Baca file dengan raw: false dan cellText: true agar SEMUA tipe data murni teks
        const workbook = XLSX.read(buffer, { type: 'array', cellText: true, raw: false });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
          throw new Error('Sheet dalam file Excel tidak terbaca atau kosong.');
        }

        // Ambil data dalam bentuk array of objects dengan nilai string murni
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { 
          raw: false,
          defval: '' 
        });

        if (rawJson.length === 0) {
          throw new Error('File Excel tidak memiliki baris data.');
        }

        const parsedRows: Jurusan[] = [];

        rawJson.forEach((row: any) => {
          let kodeVal = '';
          let pkVal = '';
          let kkVal = '';

          // Telusuri kemungkinan nama kolom
          Object.keys(row).forEach((k) => {
            const cleanKey = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const val = String(row[k] || '').trim();

            if (cleanKey === 'kode' || cleanKey === 'kd') {
              kodeVal = val;
            } else if (
              cleanKey === 'programkeahlian' ||
              cleanKey === 'program_keahlian' ||
              cleanKey === 'program' ||
              cleanKey === 'pk'
            ) {
              pkVal = val;
            } else if (
              cleanKey === 'konsentrasikeahlian' ||
              cleanKey === 'konsentrasi_keahlian' ||
              cleanKey === 'konsentrasi' ||
              cleanKey === 'kompetensikeahlian' ||
              cleanKey === 'kk' ||
              cleanKey === 'jurusan'
            ) {
              kkVal = val;
            }
          });

          // Fallback berdasar urutan kolom jika header tidak terdeteksi
          if (!kodeVal && !pkVal && !kkVal) {
            const values = Object.values(row);
            if (values.length >= 1) kodeVal = String(values[0] || '').trim();
            if (values.length >= 2) pkVal = String(values[1] || '').trim();
            if (values.length >= 3) kkVal = String(values[2] || '').trim();
          }

          if (kodeVal || pkVal || kkVal) {
            parsedRows.push({
              kode: kodeVal,
              programKeahlian: pkVal,
              konsentrasiKeahlian: kkVal
            });
          }
        });

        if (parsedRows.length === 0) {
          throw new Error('Tidak ada baris data valid yang ditemukan dalam file.');
        }

        setImportedRows(parsedRows);
      } catch (err: any) {
        setImportError(err?.message || 'Gagal membaca format file Excel. Pastikan terdapat kolom: kode, Program_Keahlian, Konsentrasi_Keahlian.');
        setImportedRows([]);
      }
    };

    reader.onerror = () => {
      setImportError('Gagal membaca file dari disk komputer.');
      setImportedRows([]);
    };

    reader.readAsArrayBuffer(file);
  };

  // Eksekusi Simpan Hasil Impor ke State & Google Sheets
  const handleApplyImport = async () => {
    if (importedRows.length === 0) return;

    setIsImporting(true);
    try {
      // 1. Update ke state aplikasi & localStorage
      onUpdateJurusan(importedRows);

      // 2. Sinkronisasi ke sheet "jurusan" di Google Sheets
      const syncRes = await syncAllJurusanDirectly(appConfig?.webAppUrl || '', importedRows);

      setNotification({
        type: 'success',
        message: syncRes.message || `Berhasil mengimpor dan memperbarui ${importedRows.length} data jurusan!`
      });

      setIsImportModalOpen(false);
      setImportedRows([]);
      setImportFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err?.message || 'Gagal menyimpan hasil impor ke Google Sheets'
      });
    } finally {
      setIsImporting(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Notification Toast */}
      {notification && (
        <div className={`p-4 rounded-2xl flex items-center justify-between text-sm shadow-md transition-all ${
          notification.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Clean Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Jurusan
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Daftar Program Keahlian dan Konsentrasi Keahlian
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all cursor-pointer disabled:opacity-50"
            title="Muat ulang dari Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{isRefreshing ? 'Memuat...' : 'Refresh'}</span>
          </button>

          {/* Unduh Format Excel */}
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 transition-all cursor-pointer"
            title="Unduh format data dalam bentuk Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Unduh Excel</span>
          </button>

          {/* Tombol Impor Data (Admin Only) */}
          {isAdmin && (
            <button
              onClick={() => {
                setImportedRows([]);
                setImportFileName('');
                setImportError(null);
                setIsImportModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Impor Data Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Clean Search & Info Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari kode atau nama jurusan..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="text-xs text-slate-500 self-end sm:self-center">
          Menampilkan <strong className="text-slate-800 font-semibold">{filteredList.length}</strong> dari {jurusanList.length} jurusan
        </div>
      </div>

      {/* Clean Table: Kolom: No, Kode, Program Keahlian, Konsentrasi Keahlian */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4 w-16 text-center border-r border-slate-200/60">No</th>
                <th className="py-3 px-5 w-32 border-r border-slate-200/60">Kode</th>
                <th className="py-3 px-5 border-r border-slate-200/60">Program Keahlian</th>
                <th className="py-3 px-5">Konsentrasi Keahlian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                      <Layers className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-slate-600">Tidak ada data jurusan</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {searchTerm ? 'Coba ubah kata kunci pencarian Anda' : 'Silakan klik "Impor Data Excel" untuk menambahkan daftar jurusan'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredList.map((item, index) => (
                  <tr 
                    key={`${item.kode}-${index}`} 
                    className="hover:bg-indigo-50/30 transition-colors"
                  >
                    <td className="py-3 px-4 text-center text-slate-500 font-medium border-r border-slate-100">
                      {index + 1}
                    </td>
                    <td className="py-3 px-5 font-bold text-indigo-700 border-r border-slate-100 whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 bg-indigo-50 border border-indigo-200/80 rounded-md font-mono text-[11px]">
                        {item.kode}
                      </span>
                    </td>
                    <td className="py-3 px-5 font-semibold text-slate-900 border-r border-slate-100">
                      {item.programKeahlian}
                    </td>
                    <td className="py-3 px-5 font-medium text-slate-700">
                      {item.konsentrasiKeahlian}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL IMPOR EXCEL (ADMIN) */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">Impor Data Jurusan dari Excel</h3>
                  <p className="text-[11px] text-slate-500">Ubah data di Excel terlebih dahulu, lalu unggah berkasnya di sini</p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImporting}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Petunjuk Format */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 space-y-1.5">
                <span className="font-semibold text-slate-800 block">Format Header Excel (Semua Tipe Teks):</span>
                <div className="flex items-center gap-2 font-mono text-[11px] bg-white border border-slate-200 p-2 rounded-lg text-indigo-700">
                  <span className="font-bold">kode</span>
                  <span className="text-slate-300">|</span>
                  <span className="font-bold">Program_Keahlian</span>
                  <span className="text-slate-300">|</span>
                  <span className="font-bold">Konsentrasi_Keahlian</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  💡 Tips: Anda dapat mengklik tombol <strong>"Unduh Excel"</strong> terlebih dahulu untuk mendapatkan template yang sudah terisi data resmi.
                </p>
              </div>

              {/* Upload Drop Area */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-2xl p-6 text-center bg-indigo-50/20 hover:bg-indigo-50/40 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 mx-auto flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-800">
                    {importFileName ? importFileName : 'Klik untuk memilih berkas Excel (.xlsx / .xls / .csv)'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Pastikan semua kolom diformat sebagai Teks
                  </p>
                </button>
              </div>

              {/* Error Alert */}
              {importError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Preview Table */}
              {importedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                    <span>Pratinjau Data ({importedRows.length} baris terbaca):</span>
                    <span className="text-emerald-600 font-bold">Siap diimpor</span>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                        <tr>
                          <th className="py-2 px-3 w-12 text-center">No</th>
                          <th className="py-2 px-3 w-28">Kode</th>
                          <th className="py-2 px-3">Program Keahlian</th>
                          <th className="py-2 px-3">Konsentrasi Keahlian</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {importedRows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2 px-3 text-center text-slate-500">{i + 1}</td>
                            <td className="py-2 px-3 font-bold text-indigo-700">{r.kode}</td>
                            <td className="py-2 px-3 font-medium text-slate-900">{r.programKeahlian}</td>
                            <td className="py-2 px-3 text-slate-700">{r.konsentrasiKeahlian}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImporting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyImport}
                disabled={importedRows.length === 0 || isImporting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan ke Spreadsheet...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Terapkan & Simpan ({importedRows.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
