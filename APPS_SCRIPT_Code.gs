/**
 * KREASI DKV — penerima data kuis & angket SUS (Google Apps Script)
 * Versi: format siap analisis (uji validitas & reliabilitas)
 *
 * CARA PASANG (jangan diunggah ke GitHub; file ini hanya untuk Google Apps Script):
 * 1. Spreadsheet tujuan > Ekstensi > Apps Script. Ganti seluruh isi Code.gs dengan file ini, Save.
 * 2. Isi SPREADSHEET_ID di bawah (atau kosongkan bila skrip dibuat dari menu Ekstensi di spreadsheet).
 * 3. Pilih fungsi ujiTulis > Run (setujui izin). Cek tab di spreadsheet, lalu hapus baris uji S99.
 * 4. Deploy > Manage deployments > ikon pensil > Version: New version > Deploy (URL /exec tetap sama).
 *
 * TAB YANG DIHASILKAN
 *  Data SUS     : 1 baris per responden (format lebar, siap SPSS/Excel/JASP)
 *                 Timestamp | Kode | Nama | Kelas | S1..S10 (poin asli 1-5) |
 *                 SK1..SK10 (skor terkonversi 0-4) | Total (0-40) | Skor SUS (0-100)
 *  Data Kuis    : 1 baris per responden. Timestamp | Kode | Nama | Kelas | K1..K15 (1=benar, 0=salah) |
 *                 Total Benar | Skor (0-100). Nomor K tetap (tidak ikut urutan acak di layar siswa).
 *  Kodebook     : daftar variabel (S1..S10, K1..K15), bunyi pernyataan/soal, arah skor, dan kunci jawaban.
 *  Angket SUS   : tampilan panjang (Kode | Nama | Pernyataan | 1-5 bertanda ✓), untuk dibaca manusia.
 *  Rekap Skor   : ringkasan Kode | Nama | Kelas | Skor Kuis | Skor SUS | Waktu Kirim.
 * Kirim ulang oleh siswa yang sama (kode sama) memperbarui baris lama, bukan menambah baris ganda.
 */
const SPREADSHEET_ID = '';        // ID spreadsheet (teks antara /d/ dan /edit pada URL), atau kosong
const FORMAT_POIN = 'KOLOM';      // tab "Angket SUS": 'KOLOM' (kolom 1-5 bertanda ✓) atau 'ANGKA' (satu kolom Poin)
const TANDA = '✓';
const SHEET_DATA_SUS = 'Data SUS';
const SHEET_DATA_KUIS = 'Data Kuis';
const SHEET_KODEBOOK = 'Kodebook';
const SHEET_SUS = 'Angket SUS';
const SHEET_REKAP = 'Rekap Skor';
const N_SUS = 10, N_KUIS = 15;
const FORMAT_WAKTU = 'dd/MM/yyyy HH:mm:ss';

function bukaSpreadsheet_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const kode = String(d.kodeSiswa || '').trim().toUpperCase();
    if (!/^[A-Z0-9._-]{2,20}$/.test(kode)) return json_({ ok: false, error: 'Kode siswa tidak valid' });

    const ss = bukaSpreadsheet_();
    const nama = String(d.nama || '').trim();
    const kelas = String(d.kelas || '').trim();
    const waktu = new Date();
    const sus = Array.isArray(d.jawabanSus) ? d.jawabanSus : [];
    const kuis = Array.isArray(d.jawabanKuis) ? d.jawabanKuis : [];

    tulisRekap_(ss, kode, nama, kelas, d.skorKuis, d.skorSus, waktu);
    if (sus.length === N_SUS) {
      tulisSusPanjang_(ss, kode, nama, sus);
      tulisDataSus_(ss, kode, nama, kelas, sus, waktu);
    }
    if (kuis.length === N_KUIS) tulisDataKuis_(ss, kode, nama, kelas, kuis, waktu);
    tulisKodebook_(ss, sus, kuis);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function doGet() { return json_({ ok: true, info: 'KREASI DKV endpoint aktif (format analisis)' }); }

/* ---------- utilitas ---------- */
function ambilSheet_(ss, nama, header) {
  let sh = ss.getSheetByName(nama);
  if (!sh) sh = ss.insertSheet(nama);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#E8EAFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Tulis satu baris per kode: perbarui bila sudah ada, tambah bila belum.
function upsertBaris_(sh, kode, baris, kolomKode) {
  const last = sh.getLastRow();
  const kodeCol = last > 1 ? sh.getRange(2, kolomKode, last - 1, 1).getValues().map(r => String(r[0]).toUpperCase()) : [];
  const idx = kodeCol.indexOf(kode);
  const r = idx >= 0 ? idx + 2 : last + 1;
  sh.getRange(r, 1, 1, baris.length).setValues([baris]);
  return r;
}

function rentang_(n) { return Array.from({ length: n }, (_, i) => i + 1); }

// Skor item SUS: pernyataan ganjil (positif) = poin-1; genap (negatif) = 5-poin.
function skorItem_(no, poin) { return no % 2 === 1 ? poin - 1 : 5 - poin; }

/* ---------- Data SUS (lebar) ---------- */
function tulisDataSus_(ss, kode, nama, kelas, sus, waktu) {
  const header = ['Timestamp', 'Kode', 'Nama', 'Kelas']
    .concat(rentang_(N_SUS).map(n => 'S' + n))
    .concat(rentang_(N_SUS).map(n => 'SK' + n))
    .concat(['Total', 'Skor SUS']);
  const sh = ambilSheet_(ss, SHEET_DATA_SUS, header);
  const poin = rentang_(N_SUS).map(n => { const j = sus.find(x => Number(x.no) === n); return j ? Number(j.poin) : ''; });
  if (poin.some(p => !(p >= 1 && p <= 5))) throw new Error('Poin SUS harus 1-5 untuk semua pernyataan');
  const sk = poin.map((p, i) => skorItem_(i + 1, p));
  const total = sk.reduce((a, b) => a + b, 0);
  const r = upsertBaris_(sh, kode, [waktu, kode, nama, kelas].concat(poin, sk, [total, total * 2.5]), 2);
  sh.getRange(r, 1).setNumberFormat(FORMAT_WAKTU);
}

/* ---------- Data Kuis (lebar, 1/0) ---------- */
function tulisDataKuis_(ss, kode, nama, kelas, kuis, waktu) {
  const header = ['Timestamp', 'Kode', 'Nama', 'Kelas']
    .concat(rentang_(N_KUIS).map(n => 'K' + n))
    .concat(['Total Benar', 'Skor (0-100)']);
  const sh = ambilSheet_(ss, SHEET_DATA_KUIS, header);
  const skor = rentang_(N_KUIS).map(n => { const j = kuis.find(x => Number(x.id) === n); return j ? (Number(j.benar) === 1 ? 1 : 0) : 0; });
  const total = skor.reduce((a, b) => a + b, 0);
  const r = upsertBaris_(sh, kode, [waktu, kode, nama, kelas].concat(skor, [total, Math.round(total / N_KUIS * 100)]), 2);
  sh.getRange(r, 1).setNumberFormat(FORMAT_WAKTU);
}

/* ---------- Kodebook: posisi tetap (baris 2-11 SUS, 12-26 Kuis) ---------- */
function tulisKodebook_(ss, sus, kuis) {
  const sh = ambilSheet_(ss, SHEET_KODEBOOK, ['Variabel', 'Keterangan', 'Arah skor / Kunci']);
  if (sus.length === N_SUS) {
    const baris = rentang_(N_SUS).map(n => {
      const j = sus.find(x => Number(x.no) === n) || {};
      return ['S' + n + ' / SK' + n, String(j.pernyataan || ''), n % 2 === 1 ? 'Positif: skor = poin - 1' : 'Negatif: skor = 5 - poin'];
    });
    sh.getRange(2, 1, N_SUS, 3).setValues(baris);
  }
  if (kuis.length === N_KUIS) {
    const baris = rentang_(N_KUIS).map(n => {
      const j = kuis.find(x => Number(x.id) === n) || {};
      return ['K' + n, String(j.soal || ''), 'Kunci: ' + String(j.kunci || '')];
    });
    sh.getRange(2 + N_SUS, 1, N_KUIS, 3).setValues(baris);
  }
  sh.setColumnWidth(2, 520);
}

/* ---------- tampilan panjang & rekap (tetap seperti sebelumnya) ---------- */
function tulisRekap_(ss, kode, nama, kelas, skorKuis, skorSus, waktu) {
  const header = ['Kode', 'Nama', 'Kelas', 'Skor Kuis', 'Skor SUS', 'Waktu Kirim'];
  const sh = ambilSheet_(ss, SHEET_REKAP, header);
  const kuis = (skorKuis === null || skorKuis === undefined || skorKuis === '') ? '' : Number(skorKuis);
  const baris = [kode, nama, kelas, kuis, Number(skorSus), waktu];
  const last = sh.getLastRow();
  const kodeCol = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]).toUpperCase()) : [];
  const idx = kodeCol.indexOf(kode);
  if (idx >= 0) {
    if (kuis === '') baris[3] = sh.getRange(idx + 2, 4).getValue(); // jangan menimpa skor kuis lama dengan kosong
    sh.getRange(idx + 2, 1, 1, header.length).setValues([baris]);
  } else {
    sh.appendRow(baris);
  }
}

function tulisSusPanjang_(ss, kode, nama, jawaban) {
  const header = FORMAT_POIN === 'ANGKA' ? ['Kode', 'Nama', 'Pernyataan', 'Poin'] : ['Kode', 'Nama', 'Pernyataan', 1, 2, 3, 4, 5];
  const sh = ambilSheet_(ss, SHEET_SUS, header);
  const last = sh.getLastRow();
  if (last > 1) {
    const kodeCol = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = kodeCol.length - 1; i >= 0; i--) {
      if (String(kodeCol[i][0]).toUpperCase() === kode) sh.deleteRow(i + 2);
    }
  }
  const rows = jawaban.map(j => {
    const poin = Number(j.poin);
    const pernyataan = `${j.no}. ${String(j.pernyataan || '').trim()}`;
    if (FORMAT_POIN === 'ANGKA') return [kode, nama, pernyataan, poin];
    return [kode, nama, pernyataan, ...[1, 2, 3, 4, 5].map(n => (n === poin ? TANDA : ''))];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
  if (FORMAT_POIN !== 'ANGKA') sh.getRange(2, 4, Math.max(sh.getLastRow() - 1, 1), 5).setHorizontalAlignment('center');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** JALANKAN MANUAL di editor (pilih fungsi ini > Run) untuk menguji tanpa situs. Hapus baris S99 sesudahnya. */
function ujiTulis() {
  const kunci = 'BACDBEADCBDAEDB'.split('');
  const e = { postData: { contents: JSON.stringify({
    kodeSiswa: 'S99', nama: 'Uji Coba', kelas: 'Mahasiswa PTIK', skorKuis: 80, skorSus: 75,
    jawabanKuis: rentang_(N_KUIS).map(n => ({ id: n, soal: 'Soal uji ' + n, kunci: kunci[n - 1], jawaban: kunci[n - 1], benar: n % 4 === 0 ? 0 : 1 })),
    jawabanSus: rentang_(N_SUS).map(n => ({ no: n, pernyataan: 'Pernyataan uji ' + n, poin: (n % 5) + 1 }))
  }) } };
  Logger.log(doPost(e).getContent());
}
