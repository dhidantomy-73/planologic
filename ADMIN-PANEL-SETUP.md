# Admin Panel — Setup

Panel admin untuk membuat post baru (Publikasi & Our Project) tanpa perlu edit HTML manual, dengan login email+password dan pengaturan akun multi-user. Post baru otomatis muncul di:
- Halaman kategori (`publications.html` atau `our-project.html`) — ditambahkan sebagai kartu terbaru.
- Beranda (`index.html`) — menggantikan slot "terbaru" (untuk Publikasi: 1 featured + 3 kartu kecil; untuk Our Project: 4 kartu aktivitas).
- Halaman post baru sendiri, dibuat di folder `Publikasi/` atau `Project/`.

Karena situs ini adalah HTML statis tanpa database, panel admin bekerja dengan cara: menerima input dari form → membuat/mengubah file HTML yang relevan → **commit langsung ke repo GitHub** lewat GitHub API. Push ke branch tersebut akan otomatis memicu deploy ulang di Netlify. Daftar akun admin panel juga disimpan sebagai file JSON di repo yang sama (`netlify/data/users.json`), dengan password ter-hash (bukan plain text).

## File yang ditambahkan

```
admin/index.html                     ← halaman admin (login + form post + pengaturan akun)
netlify/functions/login.js           ← cek email+password, buat sesi login
netlify/functions/logout.js
netlify/functions/whoami.js          ← cek status login saat admin/index.html dibuka
netlify/functions/create-post.js     ← proses utama: generate halaman post + update listing + beranda
netlify/functions/manage-users.js    ← tambah/hapus akun, ganti password
netlify/functions/_lib/*.js          ← helper (auth, akun, GitHub API, template generator)
netlify/data/users.json              ← dibuat otomatis saat akun pertama ditambahkan (jangan diedit manual)
netlify.toml                         ← konfigurasi Netlify Functions
_redirects                           ← blokir akses langsung ke /netlify/* (lihat catatan keamanan di bawah)
```

Tidak ada file situs lain yang diubah secara manual. Semua perubahan ke `index.html`, `publications.html`, `our-project.html` terjadi otomatis lewat fungsi `create-post` saat seseorang submit form, bukan saat setup ini.

## 1. Push ke repo GitHub

Folder ini belum ter-link ke git secara lokal. Cara paling aman: salin folder `admin/`, `netlify/`, file `netlify.toml`, dan file `_redirects` ke clone lokal repo GitHub Anda yang sudah terhubung ke Netlify, lalu:

```bash
git add admin netlify netlify.toml _redirects
git commit -m "Add admin panel with account management"
git push
```

Jika repo Anda memang folder ini juga (belum di-`git init`), jalankan dulu:

```bash
git init
git remote add origin <URL_REPO_GITHUB_ANDA>
git add .
git commit -m "Initial commit"
git push -u origin main
```

## 2. Buat GitHub Personal Access Token

Fungsi-fungsi di atas butuh token untuk membaca/menulis file ke repo Anda (post baru maupun `users.json`).

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
2. Repository access: pilih repo situs ini saja.
3. Permissions → **Contents: Read and write**.
4. Generate, lalu simpan tokennya (hanya tampil sekali).

(Alternatif: classic PAT dengan scope `repo` juga bisa, tapi fine-grained lebih aman karena dibatasi ke satu repo.)

**Penting:** pastikan repo GitHub-nya **private**. `users.json` menyimpan password ter-hash (di-salt dengan scrypt, bukan plain text) — file `_redirects` mencegah file ini diakses langsung lewat browser, tapi siapa pun yang punya akses baca ke repo tetap bisa melihat isinya di git history.

## 3. Set Environment Variables di Netlify

Di Netlify: **Site settings → Environment variables**, tambahkan:

| Key | Value |
|---|---|
| `ADMIN_EMAIL` | Email akun "pemilik" — selalu bisa login walau `users.json` kosong/rusak/semua akun admin terhapus |
| `ADMIN_PASSWORD` | Password untuk akun di atas — buat yang kuat |
| `SESSION_SECRET` | String acak panjang (mis. hasil `openssl rand -hex 32`) — dipakai untuk menandatangani cookie sesi |
| `GITHUB_TOKEN` | Token dari langkah 2 |
| `GITHUB_REPO` | `nama-user-atau-org/nama-repo` |
| `GITHUB_BRANCH` | Nama branch yang di-deploy Netlify, biasanya `main` |

Opsional (biasanya tidak perlu diubah):

| Key | Value | Default |
|---|---|---|
| `TEMPLATE_PUBLICATION_PATH` | Post Publikasi yang dipakai sebagai acuan style/struktur | `Publikasi/publications-2026-transjabodetabek-post.html` |
| `TEMPLATE_PROJECT_PATH` | Post Project yang dipakai sebagai acuan style/struktur | `Project/our-project-2025-bappenas-post.html` |

> Panel membuat post baru dengan cara meng-klon salah satu post yang sudah ada (CSS, header, footer disalin apa adanya) lalu mengganti judul/isi/gambar. **Jangan hapus atau ganti nama** kedua file acuan di atas — kalau memang ingin dihapus/diganti nama, update dulu env var-nya ke file lain yang masih ada.

Setelah env var tersimpan, trigger deploy ulang (atau tunggu deploy berikutnya) supaya function membacanya.

## 4. Pastikan Netlify Functions aktif

Situs ini tadinya static-only. Setelah push, cek di Netlify → **Functions** tab bahwa `login`, `logout`, `whoami`, `create-post`, `manage-users` muncul dan ter-deploy. Jika tidak muncul, pastikan `netlify.toml` ikut ter-push dan root directory build di Netlify sesuai (build command boleh kosong, publish directory `.`).

## 5. Login pertama kali & tambah akun tim

1. Buka `https://domain-anda.com/admin/`.
2. Login dengan `ADMIN_EMAIL` + `ADMIN_PASSWORD` (akun bootstrap dari env var — ini akan selalu berfungsi, tidak perlu didaftarkan di mana pun).
3. Buka tab **Pengaturan Akun** → **Tambah akun baru** untuk menambahkan anggota tim lain. Dua peran tersedia:
   - **Editor** — bisa membuat post baru.
   - **Admin** — bisa membuat post baru **dan** mengelola akun (tambah/hapus akun, lihat daftar akun).
4. Setiap orang bisa mengganti password miliknya sendiri lewat **Pengaturan Akun → Ganti password saya**. Admin bisa menghapus akun siapa pun (kecuali akun yang sedang dipakai login sendiri, untuk mencegah terkunci sendiri).

Akun bootstrap (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) tidak muncul di daftar akun dan tidak bisa dihapus — ini sengaja, sebagai jalan masuk cadangan kalau semua akun di `users.json` terhapus atau file-nya bermasalah.

## 6. Pakai panel admin untuk membuat post

Tab **Buat Post** → isi form → *Publikasikan post*. Perubahan akan live dalam ~1-2 menit (waktu build Netlify).

Field yang tersedia: kategori, judul, ringkasan (untuk kartu), lede (subjudul di halaman post, opsional), isi artikel (format sederhana: baris kosong = paragraf baru, `## ` = judul bagian, `> ` = kutipan, `**tebal**`/`*miring*`), gambar sampul + alt text, kota, topik, stakeholders, dan penulis/narasumber (nama, peran, LinkedIn, foto — opsional, bisa lebih dari satu).

## Batasan yang perlu diketahui

- **Ukuran gambar**: mengikuti pola situs saat ini, gambar disimpan langsung sebagai base64 di dalam HTML (bukan file terpisah). Gambar sampul otomatis dikompres di browser ke lebar maksimum 1600px sebelum dikirim. Netlify Functions punya batas ukuran request ~6MB — kalau ada error saat submit, coba pakai foto yang lebih kecil/ringan.
- **Tidak ada fitur edit/hapus post lewat panel** — versi ini fokus untuk *membuat* post baru. Edit/hapus post masih lewat edit file HTML langsung atau lewat GitHub.
- **Tidak ada "lupa password"** — kalau seseorang lupa password, admin lain yang perlu menggantikannya lewat Pengaturan Akun (hapus akun lama, buat ulang, atau minta admin ganti password lewat API — saat ini UI hanya menyediakan ganti password untuk diri sendiri, admin bisa mengganti lewat memanggil endpoint `manage-users` dengan `action: "change-password"` + email target).
- **Delete konflik commit**: kalau dua orang submit perubahan (post atau akun) nyaris bersamaan, ada kemungkinan kecil commit kedua gagal karena SHA file yang ditulis sudah berubah duluan. Kalau itu terjadi, cukup submit ulang.
