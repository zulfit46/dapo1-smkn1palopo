import React, { useState, useEffect, useMemo } from 'react';
import { Student, MutasiMasukItem, AppConfig, WilayahItem } from '../types';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { formatToDDMMYYYY } from '../utils/dateUtils';
import { saveMutasiMasukDirectly } from '../services/sheetsSync';
import { notifyMutasiMasuk } from '../services/telegramService';
import {
  UserPlus,
  X,
  AlertCircle,
  AlertTriangle,
  Calendar,
  Lock,
  RefreshCw,
  Check
} from 'lucide-react';

interface TambahSiswaMutasiModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRombel?: string;
  lockRombel?: boolean;
  availableRombelList: string[];
  students: Student[];
  existingMutasiMasuk?: MutasiMasukItem[];
  isAdmin: boolean;
  currentUserName: string;
  appConfig?: AppConfig;
  onAddStudentToActive?: (student: Student) => void;
  onSuccess: (item: MutasiMasukItem) => void;
}

const API_WILAYAH = 'https://www.emsifa.com/api-wilayah-indonesia/api';

const FALLBACK_PROVINCES: WilayahItem[] = [
  { id: '73', name: 'SULAWESI SELATAN' },
  { id: '76', name: 'SULAWESI BARAT' },
  { id: '72', name: 'SULAWESI TENGAH' },
  { id: '74', name: 'SULAWESI TENGGARA' },
  { id: '71', name: 'SULAWESI UTARA' },
  { id: '75', name: 'GORONTALO' },
  { id: '31', name: 'DKI JAKARTA' },
  { id: '32', name: 'JAWA BARAT' },
  { id: '33', name: 'JAWA TENGAH' },
  { id: '35', name: 'JAWA TIMUR' },
];

export const TambahSiswaMutasiModal: React.FC<TambahSiswaMutasiModalProps> = ({
  isOpen,
  onClose,
  defaultRombel = '',
  lockRombel = false,
  availableRombelList,
  students,
  existingMutasiMasuk = [],
  isAdmin,
  currentUserName,
  appConfig,
  onAddStudentToActive,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    nisn: '',
    nama: '',
    provinsiId: '',
    provinsiNama: '',
    kabKotaId: '',
    kabKotaNama: '',
    kecamatanId: '',
    kecamatanNama: '',
    sekolahAsal: '',
    rombelTujuan: defaultRombel || '',
    tglMasuk: new Date().toISOString().split('T')[0],
    status: 'Pending' as 'Pending' | 'Diterima',
    keterangan: '',
  });

  const [provinces, setProvinces] = useState<WilayahItem[]>(FALLBACK_PROVINCES);
  const [regencies, setRegencies] = useState<WilayahItem[]>([]);
  const [districts, setDistricts] = useState<WilayahItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form each time modal opens with fresh defaultRombel
  useEffect(() => {
    if (isOpen) {
      setFormData({
        nisn: '',
        nama: '',
        provinsiId: '',
        provinsiNama: '',
        kabKotaId: '',
        kabKotaNama: '',
        kecamatanId: '',
        kecamatanNama: '',
        sekolahAsal: '',
        rombelTujuan: defaultRombel && defaultRombel !== 'Semua Rombel' ? defaultRombel : '',
        tglMasuk: new Date().toISOString().split('T')[0],
        status: 'Pending',
        keterangan: '',
      });
      setRegencies([]);
      setDistricts([]);
      setFormError(null);
    }
  }, [isOpen, defaultRombel]);

  // Fetch Provinces from Wilayah API
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const fetchProvinces = async () => {
      try {
        const res = await fetch(`${API_WILAYAH}/provinces.json`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setProvinces(data);
          }
        }
      } catch {
        // Keep fallback provinces
      }
    };
    fetchProvinces();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Fetch Regencies when province changes
  useEffect(() => {
    if (!formData.provinsiId) {
      setRegencies([]);
      setDistricts([]);
      return;
    }
    let isMounted = true;
    fetch(`${API_WILAYAH}/regencies/${formData.provinsiId}.json`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (isMounted && Array.isArray(data)) setRegencies(data);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [formData.provinsiId]);

  // Fetch Districts when regency changes
  useEffect(() => {
    if (!formData.kabKotaId) {
      setDistricts([]);
      return;
    }
    let isMounted = true;
    fetch(`${API_WILAYAH}/districts/${formData.kabKotaId}.json`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (isMounted && Array.isArray(data)) setDistricts(data);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [formData.kabKotaId]);

  // Cross-rombel NISN duplicate detection
  const duplicateStudent = useMemo(() => {
    const cleanNisn = formData.nisn.trim();
    if (cleanNisn.length < 5) return null;
    return students.find((s) => String(s.nisn || '').trim() === cleanNisn) || null;
  }, [formData.nisn, students]);

  const duplicatePendingMutasi = useMemo(() => {
    const cleanNisn = formData.nisn.trim();
    if (cleanNisn.length < 5) return null;
    return (
      existingMutasiMasuk.find(
        (m) => String(m.nisn || '').trim() === cleanNisn && m.status === 'Pending'
      ) || null
    );
  }, [formData.nisn, existingMutasiMasuk]);

  if (!isOpen) return null;

  const rombelOptions = Array.from(
    new Set(
      [...availableRombelList, defaultRombel]
        .map((r) => (r || '').trim())
        .filter((r) => r && r !== 'Semua Rombel')
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanNisn = formData.nisn.trim();
    if (!cleanNisn) {
      setFormError('NISN wajib diisi');
      return;
    }
    if (cleanNisn.length !== 10) {
      setFormError('NISN harus tepat 10 digit angka');
      return;
    }
    if (duplicateStudent) {
      setFormError(
        `NISN ${cleanNisn} sudah terdaftar atas nama "${duplicateStudent.nama}" di kelas ${duplicateStudent.kelas || '-'} (Status: ${duplicateStudent.status || 'Belum Diisi'}).`
      );
      return;
    }
    if (duplicatePendingMutasi) {
      setFormError(
        `NISN ${cleanNisn} atas nama "${duplicatePendingMutasi.nama}" sudah diajukan untuk kelas ${duplicatePendingMutasi.rombelTujuan} dan sedang berstatus Pending.`
      );
      return;
    }
    if (!formData.nama.trim()) {
      setFormError('Nama Lengkap Siswa wajib diisi');
      return;
    }
    if (!formData.rombelTujuan.trim()) {
      setFormError('Silakan pilih Rombel Tujuan penempatan');
      return;
    }
    if (!formData.provinsiId) {
      setFormError('Silakan pilih Provinsi Sekolah Asal');
      return;
    }
    if (!formData.sekolahAsal.trim()) {
      setFormError('Nama Sekolah Asal wajib diisi');
      return;
    }

    setIsSaving(true);

    try {
      const textDate = formatToDDMMYYYY(formData.tglMasuk || new Date());
      const nowTimestamp = `${textDate} ${new Date().toTimeString().split(' ')[0]}`;
      const finalStatus: 'Pending' | 'Diterima' = isAdmin ? formData.status : 'Pending';

      const currentMutasiList = safeGetItem<MutasiMasukItem[]>('dapodik_cached_mutasi_masuk', []);

      const targetItem: MutasiMasukItem = {
        id: `MUT-IN-${Date.now().toString().slice(-4)}`,
        no: currentMutasiList.length + 1,
        nisn: cleanNisn,
        nama: formData.nama.trim(),
        provinsiId: formData.provinsiId,
        provinsiNama: formData.provinsiNama,
        kabKotaId: formData.kabKotaId,
        kabKotaNama: formData.kabKotaNama,
        kecamatanId: formData.kecamatanId,
        kecamatanNama: formData.kecamatanNama,
        sekolahAsal: formData.sekolahAsal.trim(),
        rombelTujuan: formData.rombelTujuan.trim(),
        tglMasuk: textDate,
        tanggalPengajuan: textDate,
        timestamp: nowTimestamp,
        status: finalStatus,
        verval_oleh: currentUserName,
        vervalOleh: currentUserName,
        keterangan:
          formData.keterangan.trim() ||
          (finalStatus === 'Diterima' ? 'Mutasi Masuk Disetujui' : 'Pengajuan Mutasi Masuk (Verval PD)'),
        createdAt: new Date().toISOString(),
      };

      const updatedList = [targetItem, ...currentMutasiList];
      safeSetItem('dapodik_cached_mutasi_masuk', updatedList);

      // Jika Admin memilih Diterima, otomatis tambahkan ke daftar siswa aktif
      if (targetItem.status === 'Diterima' && onAddStudentToActive) {
        const alreadyInStudents = students.some((s) => String(s.nisn || '').trim() === targetItem.nisn);
        if (!alreadyInStudents) {
          const newStudent: Student = {
            id: `STU-MUT-${Date.now().toString().slice(-4)}`,
            nama: targetItem.nama,
            kelas: targetItem.rombelTujuan,
            nipd: `${new Date().getFullYear()}${Math.floor(1000 + Math.random() * 9000)}`,
            nisn: targetItem.nisn,
            jk: 'L',
            tempatLahir: targetItem.kabKotaNama ? targetItem.kabKotaNama.replace(/KABUPATEN |KOTA /g, '') : 'Palopo',
            tanggalLahir: '2008-01-01',
            agama: 'Islam',
            alamat: `Kec. ${targetItem.kecamatanNama}, ${targetItem.kabKotaNama}, Prov. ${targetItem.provinsiNama}`,
            ayah: '-',
            ibu: '-',
            statusRegistrasi: 'Pindahan',
            status: 'Aktif',
            verval_oleh: currentUserName,
            vervalOleh: currentUserName,
            sekolahAsal: targetItem.sekolahAsal,
            tanggalMasuk: targetItem.tanggalPengajuan || new Date().toISOString().split('T')[0],
          };
          onAddStudentToActive(newStudent);
        }
      }

      if (appConfig?.webAppUrl) {
        saveMutasiMasukDirectly(appConfig.webAppUrl, targetItem, false).catch((err) =>
          console.warn('Latar belakang simpan ke spreadsheet:', err)
        );
      }

      notifyMutasiMasuk(targetItem, undefined, appConfig?.webAppUrl, false).catch((err) =>
        console.warn('[Telegram] Gagal mengirim notifikasi mutasi masuk:', err)
      );

      onSuccess(targetItem);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Tambah Siswa / Usulan Mutasi Masuk
              </h3>
              {/*<p className="text-xs text-indigo-100 mt-0.5">
                {lockRombel && formData.rombelTujuan
                  ? `Rombel Tujuan otomatis dikunci ke kelas ${formData.rombelTujuan} • Data masuk ke sheet mutasi_masuk`
                  : 'Form penambahan peserta didik baru (Mutasi Masuk)'}
              </p>*/}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {duplicateStudent && !formError && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-amber-900 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">NISN Sudah Terdaftar di Sistem: </span>
                <span>
                  Siswa atas nama <strong>{duplicateStudent.nama}</strong> sudah tercatat di kelas{' '}
                  <strong>{duplicateStudent.kelas || '-'}</strong> dengan status{' '}
                  <strong>{duplicateStudent.status || 'Belum Diisi'}</strong>.
                </span>
              </div>
            </div>
          )}

          {duplicatePendingMutasi && !duplicateStudent && !formError && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-amber-900 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Pengajuan Sudah Ada: </span>
                <span>
                  NISN ini atas nama <strong>{duplicatePendingMutasi.nama}</strong> untuk kelas{' '}
                  <strong>{duplicatePendingMutasi.rombelTujuan}</strong> sedang berstatus{' '}
                  <strong>Pending</strong> menunggu persetujuan Admin.
                </span>
              </div>
            </div>
          )}

          {/* Grid Inputs - Sama persis dengan Form Mutasi Masuk */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* 1. NISN */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                NISN <span className="text-rose-500">*</span>
                <span className="text-[10px] text-slate-400 ml-1 font-normal">(10 digit)</span>
              </label>
              <input
                type="text"
                required
                maxLength={10}
                value={formData.nisn}
                onChange={(e) => {
                  setFormError(null);
                  setFormData({ ...formData, nisn: e.target.value.replace(/\D/g, '') });
                }}
                placeholder="Contoh: 0071829301"
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 2. Nama Lengkap Siswa */}
            <div className="lg:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1.5">
                Nama Lengkap Siswa <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.nama}
                onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                placeholder="Nama lengkap peserta didik sesuai ijazah/akta"
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 3. Rombel Tujuan (Otomatis sesuai kelas Wali Kelas) */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>
                  Rombel Tujuan <span className="text-rose-500">*</span>
                </span>
                {lockRombel && (
                  <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Otomatis
                  </span>
                )}
              </label>
              {lockRombel ? (
                <div className="w-full px-3 py-2 bg-indigo-50/90 rounded-lg border border-indigo-200 font-bold text-indigo-900 flex items-center justify-between">
                  <span>{formData.rombelTujuan || '-'}</span>
                  <Lock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                </div>
              ) : (
                <select
                  required
                  value={formData.rombelTujuan}
                  onChange={(e) => setFormData({ ...formData, rombelTujuan: e.target.value })}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">-- Pilih Rombel Tujuan --</option>
                  {rombelOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 4. Provinsi Asal */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Provinsi Sekolah Asal <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={formData.provinsiId}
                onChange={(e) => {
                  const prov = provinces.find((p) => p.id === e.target.value);
                  setFormData({
                    ...formData,
                    provinsiId: e.target.value,
                    provinsiNama: prov?.name || '',
                    kabKotaId: '',
                    kabKotaNama: '',
                    kecamatanId: '',
                    kecamatanNama: '',
                  });
                }}
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="">-- Pilih Provinsi Sekolah Asal --</option>
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Kab/Kota Asal */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Kabupaten / Kota Asal
              </label>
              <select
                disabled={!formData.provinsiId}
                value={formData.kabKotaId}
                onChange={(e) => {
                  const kab = regencies.find((k) => k.id === e.target.value);
                  setFormData({
                    ...formData,
                    kabKotaId: e.target.value,
                    kabKotaNama: kab?.name || '',
                    kecamatanId: '',
                    kecamatanNama: '',
                  });
                }}
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
              >
                <option value="">-- Pilih Kab/Kota --</option>
                {regencies.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 6. Kecamatan Asal */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Kecamatan Asal
              </label>
              <select
                disabled={!formData.kabKotaId}
                value={formData.kecamatanId}
                onChange={(e) => {
                  const kec = districts.find((d) => d.id === e.target.value);
                  setFormData({
                    ...formData,
                    kecamatanId: e.target.value,
                    kecamatanNama: kec?.name || '',
                  });
                }}
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
              >
                <option value="">-- Pilih Kecamatan --</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 7. Nama Sekolah Asal */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Nama Sekolah Asal <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.sekolahAsal}
                onChange={(e) => setFormData({ ...formData, sekolahAsal: e.target.value })}
                placeholder="Contoh: SMA Negeri 1 Palopo"
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 8. Tanggal Masuk */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  Tgl Masuk <span className="text-rose-500">*</span>
                </span>
              </label>
              <input
                type="date"
                required
                value={formData.tglMasuk}
                onChange={(e) => setFormData({ ...formData, tglMasuk: e.target.value })}
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Disimpan sebagai teks tanggal (DD/MM/YYYY)
              </span>
            </div>

            {/* 9. Status Mutasi */}
            <div className="lg:col-span-3">
              <label className="block font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Status Mutasi</span>
                {!isAdmin && (
                  <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Hanya Admin yang dapat mengubah Status
                  </span>
                )}
              </label>
              {isAdmin ? (
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as 'Pending' | 'Diterima' })
                    }
                    className="px-3 py-2 bg-white rounded-lg border border-slate-300 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer text-xs"
                  >
                    <option value="Pending">Pending (Menunggu Verifikasi)</option>
                    <option value="Diterima">Diterima (Disetujui Masuk Rombel)</option>
                  </select>
                  <span className="text-[11px] text-slate-500">
                    {formData.status === 'Diterima'
                      ? 'Siswa otomatis dimasukkan ke rombel tujuan dan berstatus aktif.'
                      : 'Proses Input ke Aplikasi Dapodik.'}
                  </span>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-100 rounded-lg border border-slate-200 text-[11px] text-slate-700 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      Status saat ini: <strong className="text-amber-700 font-bold">Pending</strong> (Terkunci &bull; Menunggu persetujuan Admin sebelum masuk ke daftar Verval PD)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600 border border-slate-300 shrink-0">
                    Terkunci
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Simpan Usulan Siswa
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
