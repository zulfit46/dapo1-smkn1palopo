import { Student, normalizeStudent } from '../types';
import { formatToDDMMYYYY, parseToYYYYMMDD } from '../utils/dateUtils';

/**
 * 69 Header Resmi Sheet "data" Biodata Peserta Didik Dapodik SMKN 1 Palopo
 */
export const DAPODIK_DATA_HEADERS = [
  'Nama',
  'NIPD',
  'JK',
  'NISN',
  't_lahir',
  'tgl_lahir',
  'NIK',
  'Agama',
  'Alamat',
  'RT',
  'RW',
  'Dusun',
  'Kelurahan',
  'Kecamatan',
  'kode_pos',
  'jenis_tinggal',
  'transportaso',
  'Telepon',
  'HP',
  'email',
  'SKHUN',
  'kps',
  'no_kps',
  'nama_ayah',
  'thn_lahir_ayah',
  'pend_ayah',
  'kerja_ayah',
  'pengh_ayah',
  'nik_ayah',
  'nama_ibu',
  'thn_lahir_ibu',
  'pend_ibu',
  'kerja_ibu',
  'pengh_ibu',
  'nik_ibu',
  'namawali',
  'thnwali',
  'pendwali',
  'pekwali',
  'pengwali',
  'nikwali',
  'rombel',
  'no_ujian',
  'no_ijazah',
  'kip',
  'no_kip',
  'nama_kip',
  'no_kks',
  'reg_akta',
  'Bank',
  'no_rek',
  'rek_nama',
  'layak_pip',
  'alasan',
  'keb_khusus',
  'sekolah_asal',
  'anak_ke',
  'Lintang',
  'Bujur',
  'no_kk',
  'berat_badan',
  'tinggi_badan',
  'lingkar_kepala',
  'jum_saudara',
  'jarak_sekolah',
  'status',
  'ket',
  'timestamp',
  'verval_oleh'
] as const;

export type DapodikDataHeader = typeof DAPODIK_DATA_HEADERS[number];

/**
 * Mengubah data Student menjadi baris Excel dengan 69 kolom teks murni sesuai header Dapodik
 */
export function studentToDapodikRow(s: Student): Record<string, string> {
  const tglLahirFormatted = s.tanggalLahir
    ? (s.tanggalLahir.includes('-') ? formatToDDMMYYYY(s.tanggalLahir) : s.tanggalLahir)
    : (s.tgl_lahir || '');

  return {
    Nama: String(s.nama || s.Nama || '').trim(),
    NIPD: String(s.nipd || s.NIPD || '').trim(),
    JK: String(s.jk || s.JK || 'L').trim().toUpperCase(),
    NISN: String(s.nisn || s.NISN || '').trim(),
    t_lahir: String(s.tempatLahir || s.t_lahir || s.tlahir || '').trim(),
    tgl_lahir: String(tglLahirFormatted).trim(),
    NIK: String(s.nik || s.NIK || '').trim(),
    Agama: String(s.agama || s.Agama || 'Islam').trim(),
    Alamat: String(s.alamat || s.Alamat || '').trim(),
    RT: String(s.rt || s.RT || '').trim(),
    RW: String(s.rw || s.RW || '').trim(),
    Dusun: String(s.dusun || s.Dusun || '').trim(),
    Kelurahan: String(s.kelurahan || s.Kelurahan || '').trim(),
    Kecamatan: String(s.kecamatan || s.Kecamatan || '').trim(),
    kode_pos: String(s.kode_pos || s.kodePos || s.kodepos || '').trim(),
    jenis_tinggal: String(s.jenis_tinggal || s.jenisTinggal || 'Bersama orang tua').trim(),
    transportaso: String(s.transportaso || s.transportasi || 'Sepeda Motor').trim(),
    Telepon: String(s.telepon || s.Telepon || '').trim(),
    HP: String(s.noHp || s.hp || s.HP || '').trim(),
    email: String(s.email || s.Email || '').trim(),
    SKHUN: String(s.skhun || s.SKHUN || '').trim(),
    kps: String(s.kps || s.KPS || 'Tidak').trim(),
    no_kps: String(s.no_kps || s.noKps || '').trim(),
    nama_ayah: String(s.ayah || s.nama_ayah || s.namaAyah || '').trim(),
    thn_lahir_ayah: String(s.thn_lahir_ayah || s.thnLahirAyah || '').trim(),
    pend_ayah: String(s.pend_ayah || s.pendAyah || '').trim(),
    kerja_ayah: String(s.pekerjaanAyah || s.kerja_ayah || '').trim(),
    pengh_ayah: String(s.pengh_ayah || s.penghAyah || '').trim(),
    nik_ayah: String(s.nik_ayah || s.nikAyah || '').trim(),
    nama_ibu: String(s.ibu || s.nama_ibu || s.namaIbu || '').trim(),
    thn_lahir_ibu: String(s.thn_lahir_ibu || s.thnLahirIbu || '').trim(),
    pend_ibu: String(s.pend_ibu || s.pendIbu || '').trim(),
    kerja_ibu: String(s.pekerjaanIbu || s.kerja_ibu || '').trim(),
    pengh_ibu: String(s.pengh_ibu || s.penghIbu || '').trim(),
    nik_ibu: String(s.nik_ibu || s.nikIbu || '').trim(),
    namawali: String(s.namawali || s.namaWali || s.nama_wali || s.wali || '').trim(),
    thnwali: String(s.thnwali || s.thnWali || '').trim(),
    pendwali: String(s.pendwali || s.pendWali || '').trim(),
    pekwali: String(s.pekwali || s.pekWali || '').trim(),
    pengwali: String(s.pengwali || s.pengWali || '').trim(),
    nikwali: String(s.nikwali || s.nikWali || '').trim(),
    rombel: String(s.kelas || s.rombel || '').trim(),
    no_ujian: String(s.no_ujian || s.noUjian || '').trim(),
    no_ijazah: String(s.no_ijazah || s.noIjazah || '').trim(),
    kip: String(s.kip || s.KIP || 'Tidak').trim(),
    no_kip: String(s.no_kip || s.noKip || '').trim(),
    nama_kip: String(s.nama_kip || s.namaKip || '').trim(),
    no_kks: String(s.no_kks || s.noKks || '').trim(),
    reg_akta: String(s.reg_akta || s.regAkta || '').trim(),
    Bank: String(s.bank || s.Bank || '').trim(),
    no_rek: String(s.no_rek || s.noRek || '').trim(),
    rek_nama: String(s.rek_nama || s.rekNama || '').trim(),
    layak_pip: String(s.layak_pip || s.layakPip || '').trim(),
    alasan: String(s.alasan || s.Alasan || '').trim(),
    keb_khusus: String(s.keb_khusus || s.kebKhusus || 'Tidak').trim(),
    sekolah_asal: String(s.sekolahAsal || s.sekolah_asal || '').trim(),
    anak_ke: String(s.anak_ke || s.anakKe || '').trim(),
    Lintang: String(s.lintang || s.Lintang || '').trim(),
    Bujur: String(s.bujur || s.Bujur || '').trim(),
    no_kk: String(s.no_kk || s.noKk || '').trim(),
    berat_badan: String(s.beratBadan || s.berat_badan || '').trim(),
    tinggi_badan: String(s.tinggiBadan || s.tinggi_badan || '').trim(),
    lingkar_kepala: String(s.lingkar_kepala || s.lingkarKepala || '').trim(),
    jum_saudara: String(s.jumlahSaudara || s.jum_saudara || '').trim(),
    jarak_sekolah: String(s.jarakSekolah || s.jarak_sekolah || '').trim(),
    status: String(s.status || 'Aktif').trim(),
    ket: String(s.ket || '').trim(),
    timestamp: String(s.timestamp || '').trim(),
    verval_oleh: String(s.verval_oleh || s.vervalOleh || '').trim()
  };
}

/**
 * Parsing baris Excel menjadi Student object lengkap dan ternormalisasi
 * Seluruh nilai dipastikan berformat text murni (tanpa scientific notation/kehilangan angka 0 di depan)
 */
export function dapodikRowToStudent(row: Record<string, any>, idx: number): Student {
  // Buat lookup case-insensitive tanpa spasi/simbol
  const cleanMap: Record<string, string> = {};
  Object.keys(row).forEach((k) => {
    const c = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    cleanMap[c] = String(row[k] !== undefined && row[k] !== null ? row[k] : '').trim();
  });

  const getVal = (...keys: string[]): string => {
    for (const key of keys) {
      const c = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanMap[c] !== undefined && cleanMap[c] !== '') {
        return cleanMap[c];
      }
    }
    return '';
  };

  const rawNama = getVal('Nama', 'nama');
  const rawNipd = getVal('NIPD', 'nipd');
  const rawJk = getVal('JK', 'jk');
  const rawNisn = getVal('NISN', 'nisn');
  const rawTLahir = getVal('t_lahir', 'tlahir', 'tempat_lahir', 'tempatlahir');
  const rawTglLahir = getVal('tgl_lahir', 'tgllahir', 'tanggal_lahir', 'tanggallahir');
  const rawNik = getVal('NIK', 'nik');
  const rawAgama = getVal('Agama', 'agama');
  const rawAlamat = getVal('Alamat', 'alamat');
  const rawRt = getVal('RT', 'rt');
  const rawRw = getVal('RW', 'rw');
  const rawDusun = getVal('Dusun', 'dusun');
  const rawKelurahan = getVal('Kelurahan', 'kelurahan', 'desa');
  const rawKecamatan = getVal('Kecamatan', 'kecamatan');
  const rawKodePos = getVal('kode_pos', 'kodepos', 'kode_pos');
  const rawJenisTinggal = getVal('jenis_tinggal', 'jenistinggal');
  const rawTransportaso = getVal('transportaso', 'transportasi', 'alat_transportasi');
  const rawTelepon = getVal('Telepon', 'telepon', 'telp');
  const rawHp = getVal('HP', 'hp', 'no_hp', 'nohp');
  const rawEmail = getVal('email', 'Email');
  const rawSkhun = getVal('SKHUN', 'skhun');
  const rawKps = getVal('kps', 'KPS');
  const rawNoKps = getVal('no_kps', 'nokps');
  const rawNamaAyah = getVal('nama_ayah', 'ayah', 'namaayah');
  const rawThnLahirAyah = getVal('thn_lahir_ayah', 'thnlahirayah', 'tahun_lahir_ayah');
  const rawPendAyah = getVal('pend_ayah', 'pendayah', 'pendidikan_ayah');
  const rawKerjaAyah = getVal('kerja_ayah', 'kerjaayah', 'pekerjaan_ayah', 'pekerjaanayah');
  const rawPenghAyah = getVal('pengh_ayah', 'penghayah', 'penghasilan_ayah');
  const rawNikAyah = getVal('nik_ayah', 'nikayah');
  const rawNamaIbu = getVal('nama_ibu', 'ibu', 'namaibu');
  const rawThnLahirIbu = getVal('thn_lahir_ibu', 'thnlahiribu', 'tahun_lahir_ibu');
  const rawPendIbu = getVal('pend_ibu', 'pendibu', 'pendidikan_ibu');
  const rawKerjaIbu = getVal('kerja_ibu', 'kerjaibu', 'pekerjaan_ibu', 'pekerjaanibu');
  const rawPenghIbu = getVal('pengh_ibu', 'penghibu', 'penghasilan_ibu');
  const rawNikIbu = getVal('nik_ibu', 'nikibu');
  const rawNamaWali = getVal('namawali', 'nama_wali', 'wali');
  const rawThnWali = getVal('thnwali', 'thn_wali', 'tahun_wali');
  const rawPendWali = getVal('pendwali', 'pend_wali', 'pendidikan_wali');
  const rawPekWali = getVal('pekwali', 'pek_wali', 'pekerjaan_wali');
  const rawPengWali = getVal('pengwali', 'peng_wali', 'penghasilan_wali');
  const rawNikWali = getVal('nikwali', 'nik_wali');
  const rawRombel = getVal('rombel', 'kelas', 'tingkat');
  const rawNoUjian = getVal('no_ujian', 'noujian');
  const rawNoIjazah = getVal('no_ijazah', 'noijazah');
  const rawKip = getVal('kip', 'KIP');
  const rawNoKip = getVal('no_kip', 'nokip');
  const rawNamaKip = getVal('nama_kip', 'namakip');
  const rawNoKks = getVal('no_kks', 'nokks');
  const rawRegAkta = getVal('reg_akta', 'regakta');
  const rawBank = getVal('Bank', 'bank');
  const rawNoRek = getVal('no_rek', 'norek');
  const rawRekNama = getVal('rek_nama', 'reknama', 'nama_rekening');
  const rawLayakPip = getVal('layak_pip', 'layakpip');
  const rawAlasan = getVal('alasan', 'Alasan');
  const rawKebKhusus = getVal('keb_khusus', 'kebkhusus', 'kebutuhan_khusus');
  const rawSekolahAsal = getVal('sekolah_asal', 'sekolahasal');
  const rawAnakKe = getVal('anak_ke', 'anakke');
  const rawLintang = getVal('Lintang', 'lintang');
  const rawBujur = getVal('Bujur', 'bujur');
  const rawNoKk = getVal('no_kk', 'nokk');
  const rawBeratBadan = getVal('berat_badan', 'beratbadan');
  const rawTinggiBadan = getVal('tinggi_badan', 'tinggibadan');
  const rawLingkarKepala = getVal('lingkar_kepala', 'lingkarkepala');
  const rawJumSaudara = getVal('jum_saudara', 'jumsaudara', 'jumlah_saudara');
  const rawJarakSekolah = getVal('jarak_sekolah', 'jaraksekolah');
  const rawStatus = getVal('status', 'Status') || 'Aktif';
  const rawKet = getVal('ket', 'keterangan');
  const rawTimestamp = getVal('timestamp', 'waktu');
  const rawVervalOleh = getVal('verval_oleh', 'vervaloleh', 'petugas');

  // Normalisasi Tanggal Lahir (ISO format YYYY-MM-DD untuk kalender, text dd/MM/yyyy untuk tampilan)
  const normalizedTglLahirIso = parseToYYYYMMDD(rawTglLahir);

  const studentObj: any = {
    id: rawNipd || rawNisn || `STU-IMP-${idx + 1}`,
    nama: rawNama,
    kelas: rawRombel,
    nipd: rawNipd,
    nisn: rawNisn,
    jk: rawJk.toUpperCase().startsWith('P') ? 'P' : 'L',
    tempatLahir: rawTLahir,
    tanggalLahir: normalizedTglLahirIso || rawTglLahir,
    agama: rawAgama || 'Islam',
    alamat: rawAlamat,
    ayah: rawNamaAyah,
    ibu: rawNamaIbu,
    pekerjaanAyah: rawKerjaAyah,
    pekerjaanIbu: rawKerjaIbu,
    noHp: rawHp,
    email: rawEmail,
    status: rawStatus,
    ket: rawKet,
    timestamp: rawTimestamp,
    vervalOleh: rawVervalOleh,
    verval_oleh: rawVervalOleh,
    sekolahAsal: rawSekolahAsal,
    tinggiBadan: Number(rawTinggiBadan) || undefined,
    beratBadan: Number(rawBeratBadan) || undefined,
    jarakSekolah: rawJarakSekolah,
    jumlahSaudara: Number(rawJumSaudara) || undefined,

    // 69 Kolom mentah sheet "data"
    Nama: rawNama,
    NIPD: rawNipd,
    JK: rawJk.toUpperCase().startsWith('P') ? 'P' : 'L',
    NISN: rawNisn,
    t_lahir: rawTLahir,
    tgl_lahir: rawTglLahir,
    NIK: rawNik,
    Agama: rawAgama,
    Alamat: rawAlamat,
    RT: rawRt,
    RW: rawRw,
    Dusun: rawDusun,
    Kelurahan: rawKelurahan,
    Kecamatan: rawKecamatan,
    kode_pos: rawKodePos,
    jenis_tinggal: rawJenisTinggal,
    transportaso: rawTransportaso,
    Telepon: rawTelepon,
    HP: rawHp,
    SKHUN: rawSkhun,
    kps: rawKps,
    no_kps: rawNoKps,
    nama_ayah: rawNamaAyah,
    thn_lahir_ayah: rawThnLahirAyah,
    pend_ayah: rawPendAyah,
    kerja_ayah: rawKerjaAyah,
    pengh_ayah: rawPenghAyah,
    nik_ayah: rawNikAyah,
    nama_ibu: rawNamaIbu,
    thn_lahir_ibu: rawThnLahirIbu,
    pend_ibu: rawPendIbu,
    kerja_ibu: rawKerjaIbu,
    pengh_ibu: rawPenghIbu,
    nik_ibu: rawNikIbu,
    namawali: rawNamaWali,
    thnwali: rawThnWali,
    pendwali: rawPendWali,
    pekwali: rawPekWali,
    pengwali: rawPengWali,
    nikwali: rawNikWali,
    rombel: rawRombel,
    no_ujian: rawNoUjian,
    no_ijazah: rawNoIjazah,
    kip: rawKip,
    no_kip: rawNoKip,
    nama_kip: rawNamaKip,
    no_kks: rawNoKks,
    reg_akta: rawRegAkta,
    Bank: rawBank,
    no_rek: rawNoRek,
    rek_nama: rawRekNama,
    layak_pip: rawLayakPip,
    alasan: rawAlasan,
    keb_khusus: rawKebKhusus,
    sekolah_asal: rawSekolahAsal,
    anak_ke: rawAnakKe,
    Lintang: rawLintang,
    Bujur: rawBujur,
    no_kk: rawNoKk,
    berat_badan: rawBeratBadan,
    tinggi_badan: rawTinggiBadan,
    lingkar_kepala: rawLingkarKepala,
    jum_saudara: rawJumSaudara,
    jarak_sekolah: rawJarakSekolah
  };

  return normalizeStudent(studentObj);
}
