# SSH Visual File Explorer

SSH Visual File Explorer adalah aplikasi web untuk mengakses file server remote melalui SSH/SFTP secara visual. Aplikasi ini dirancang untuk memudahkan aktivitas browse direktori, membaca file, mengedit file teks, membuat file atau folder baru, menghapus file atau folder, dan mengunduh file atau folder tanpa perlu workflow manual berbasis terminal seperti `scp` atau `sftp`.

Project ini mendukung dua mode runtime:

- local development melalui Express + Vite
- deployment serverless di Vercel melalui Vercel Functions

## Tujuan Project

- Menyediakan antarmuka web sederhana untuk manajemen file server remote
- Mengurangi ketergantungan pada command line untuk operasi file berbasis SSH
- Menjaga arsitektur tetap ringan, mudah di-deploy, dan cukup aman untuk single-tenant usage

## Fitur Utama

- Koneksi ke host remote menggunakan password atau private key SSH
- Browse direktori remote secara visual
- Baca dan edit file teks langsung dari browser
- Buat file dan folder baru
- Upload satu atau banyak file dari komputer lokal ke direktori remote aktif
- Download file atau folder tanpa command manual
- Download banyak item terpilih sekaligus sebagai satu arsip
- Hapus file atau folder secara rekursif

## Tech Stack

### Frontend

- `React 19`
  Untuk membangun UI koneksi SSH, browser direktori, editor file, dan notifikasi.
- `TypeScript`
  Untuk type safety pada komponen, payload API, dan shared types.
- `Vite`
  Sebagai dev server frontend dan build tool untuk output static production.
- `Tailwind CSS 4`
  Untuk styling utility-first.
- `Lucide React`
  Untuk iconografi UI.

### Backend

- `Node.js`
  Runtime utama untuk local server dan serverless function.
- `Express`
  Dipakai pada mode local development sebagai backend API dan host middleware Vite.
- `Vercel Functions`
  Digunakan saat deployment di Vercel agar endpoint SSH berjalan secara serverless.
- `node-ssh`
  Wrapper tingkat tinggi untuk koneksi SSH dan akses SFTP.
- `ssh2`
  Dependency pendukung SSH/SFTP di level protokol.
- `dotenv`
  Untuk memuat environment variable pada local development.

### Tooling

- `tsx`
  Menjalankan file TypeScript langsung saat development.
- `esbuild`
  Membundel `server.ts` untuk runtime production lokal.
- `TypeScript Compiler`
  Dipakai pada `npm run lint` untuk validasi type-level.

## Struktur Utama

```text
.
|-- api/
|   |-- _utils.ts
|   `-- ssh/
|       |-- test.ts
|       |-- list.ts
|       |-- read.ts
|       |-- write.ts
|       |-- mkdir.ts
|       |-- delete.ts
|       |-- download-ticket.ts
|       `-- download.ts
|-- src/
|   |-- components/
|   |   |-- ConnectionPanel.tsx
|   |   |-- FileBrowser.tsx
|   |   `-- FileEditor.tsx
|   |-- server/
|   |   `-- core.ts
|   |-- App.tsx
|   |-- main.tsx
|   |-- index.css
|   `-- types.ts
|-- server.ts
|-- vercel.json
|-- vite.config.ts
`-- package.json
```

## Komponen dan Teknologi yang Digunakan

### 1. Frontend Application

Frontend dimulai dari [src/main.tsx](</C:/project-gabut/ssh-visual-file-explorer/src/main.tsx:1>) dan dirakit di [src/App.tsx](</C:/project-gabut/ssh-visual-file-explorer/src/App.tsx:1>). UI dibagi menjadi tiga area utama:

- [ConnectionPanel.tsx](</C:/project-gabut/ssh-visual-file-explorer/src/components/ConnectionPanel.tsx:1>)
  Menangani input host, username, port, jenis autentikasi, upload private key, serta test koneksi.
- [FileBrowser.tsx](</C:/project-gabut/ssh-visual-file-explorer/src/components/FileBrowser.tsx:1>)
  Menampilkan isi direktori remote, breadcrumb, pencarian, pembuatan file/folder, download, dan delete.
- [FileEditor.tsx](</C:/project-gabut/ssh-visual-file-explorer/src/components/FileEditor.tsx:1>)
  Menyediakan editor file teks sederhana dengan save, revert, dan unsaved-change handling.

### 2. Shared SSH Core

[src/server/core.ts](</C:/project-gabut/ssh-visual-file-explorer/src/server/core.ts:1>) adalah pusat logika backend. File ini dipakai bersama oleh:

- local Express server
- Vercel Functions

Fungsi utamanya mencakup:

- membuat koneksi SSH
- resolve home directory dan target path
- list direktori via SFTP
- read dan write file remote
- create directory
- recursive delete via SFTP
- generate dan verify encrypted download token
- stream file atau folder download

### 3. Local Backend

[server.ts](</C:/project-gabut/ssh-visual-file-explorer/server.ts:1>) dipakai untuk menjalankan project secara lokal. Pada mode development, file ini:

- membuat Express app
- memasang security headers dasar
- menyediakan endpoint API `/api/ssh/*`
- menjalankan Vite middleware untuk frontend

### 4. Vercel Serverless Backend

Folder [api/ssh](</C:/project-gabut/ssh-visual-file-explorer/api/ssh/test.ts:1>) berisi Vercel Functions yang memetakan endpoint API satu per satu. Setiap function memanggil shared core di `src/server/core.ts`, sehingga perilaku local dan production tetap konsisten.

### 5. Deployment Configuration

[vercel.json](</C:/project-gabut/ssh-visual-file-explorer/vercel.json:1>) mengatur:

- static output directory hasil build Vite
- durasi maksimal function
- file tracing tambahan untuk shared server core
- response headers keamanan

## Workflow Aplikasi

### Workflow Pengguna

1. User membuka aplikasi web.
2. User mengisi `Host`, `Port`, `Username`, lalu memilih autentikasi `Password` atau `PEM Private Key`.
3. Frontend memanggil endpoint `/api/ssh/test`.
4. Backend mencoba membuat koneksi SSH dan mengembalikan home directory bila sukses.
5. Setelah terkoneksi, frontend menampilkan browser direktori remote.
6. User dapat melakukan operasi seperti:
   - membuka folder
   - membuka file teks
   - mengedit dan menyimpan file
   - membuat folder baru
   - membuat file baru
   - mengunggah satu atau banyak file dari komputer lokal
   - menghapus file atau folder
   - mengunduh satu file, satu folder, atau banyak item terpilih

### Workflow Request Teknis

#### Test Connection

1. Frontend mengirim kredensial ke `/api/ssh/test`
2. Backend memanggil `testConnection()`
3. `node-ssh` membuat koneksi ke host remote
4. Backend menjalankan `pwd`
5. Home directory dikembalikan ke frontend

#### List Directory

1. Frontend memanggil `/api/ssh/list`
2. Backend resolve path target
3. Backend membuka SFTP session
4. Backend membaca isi direktori
5. Hasil di-normalisasi lalu diurutkan folder dahulu, file setelahnya
6. Frontend merender daftar direktori

#### Read File

1. Frontend memanggil `/api/ssh/read`
2. Backend cek ukuran file
3. File di atas 15 MB ditolak untuk editor web
4. File dibaca sebagai UTF-8 stream
5. Konten dikirim ke editor

#### Write File

1. Frontend mengirim isi file baru ke `/api/ssh/write`
2. Backend membuka SFTP
3. Backend menulis ulang file remote
4. Respons sukses dikirim kembali ke frontend

#### Delete Path

1. Frontend memanggil `/api/ssh/delete`
2. Backend melakukan `lstat`
3. Jika target file atau symlink, backend menghapus langsung
4. Jika target direktori, backend menghapus rekursif via SFTP

#### Upload File

1. User menekan tombol `Upload File`
2. Browser memilih satu atau banyak file dari komputer lokal
3. Frontend membaca setiap file dan mengubahnya menjadi payload Base64
4. Frontend mengirim file-file tersebut ke `/api/ssh/upload` secara berurutan
5. Backend membuat koneksi SSH dan membuka SFTP
6. Backend menulis file binary ke path remote target
7. Frontend me-refresh isi direktori aktif

#### Download File atau Folder

1. Frontend meminta token ke `/api/ssh/download-ticket`
2. Backend membuat encrypted short-lived token
3. Frontend memanggil `/api/ssh/download?token=...`
4. Backend memverifikasi token
5. Jika target file, backend stream file via SFTP
6. Jika target folder, backend menjalankan `tar -czf -` di host remote lalu stream hasil arsip ke browser
7. Jika target adalah banyak item terpilih, backend membungkus semuanya sebagai satu `.tar.gz`

## Security dan Design Considerations

Project ini sudah mengandung beberapa pengamanan dasar:

- kredensial tidak disimpan permanen di backend
- private key, password, dan passphrase tidak disimpan ke `localStorage`
- download token dienkripsi dan dibatasi masa aktif
- operasi delete tidak memakai shell `rm -rf`
- API dan app mengirim header keamanan dasar
- folder download memakai token, bukan path terbuka langsung
- upload file dibatasi kecil-menengah agar tetap kompatibel dengan deployment serverless

Meski begitu, ada batasan desain yang tetap perlu dipahami:

- backend tetap menerima kredensial SSH user untuk membuka koneksi ke host remote
- deployment publik tanpa auth tambahan tidak cocok untuk multi-user environment
- Vercel Functions bersifat stateless sehingga koneksi SSH dibuka ulang setiap request
- file atau folder besar masih dapat terkena limit durasi function di platform serverless
- upload file di deployment Vercel dibatasi oleh limit request body platform. Implementasi saat ini membatasi upload sampai 3 MB per file agar tetap aman di Vercel Hobby

## Environment Variables

```env
PORT=3000
HOST=0.0.0.0
DISABLE_HMR=false
DOWNLOAD_TOKEN_SECRET=change-this-to-a-long-random-secret
```

Keterangan:

- `PORT`
  Port local server saat development.
- `HOST`
  Host bind local server.
- `DISABLE_HMR`
  Menonaktifkan HMR Vite bila dibutuhkan.
- `DOWNLOAD_TOKEN_SECRET`
  Wajib di production untuk mengenkripsi token download sementara.

## Menjalankan Secara Lokal

### Prasyarat

- Node.js 20+
- npm 10+
- akses SSH ke host remote

### Langkah

1. Install dependency:
   `npm install`
2. Opsional: salin `.env.example` menjadi `.env`
3. Jalankan development server:
   `npm run dev`
4. Buka:
   `http://localhost:3000`

## Script yang Tersedia

- `npm run dev`
  Menjalankan Express + Vite untuk local development.
- `npm run lint`
  Menjalankan type-check TypeScript.
- `npm run build`
  Build frontend dan bundle local server production.
- `npm run start`
  Menjalankan hasil build lokal dari `dist/server.cjs`.
- `npm run clean`
  Menghapus artefak build.

## Deployment ke Vercel Hobby

Arsitektur project ini sudah disiapkan untuk deployment di Vercel Hobby dengan pendekatan:

- frontend sebagai static Vite build
- backend SSH sebagai Vercel Functions
- shared business logic pada satu server core

### Langkah Deploy

1. Push project ke repository Git.
2. Import repository ke Vercel.
3. Pastikan framework terdeteksi sebagai `Vite`.
4. Tambahkan environment variable:
   `DOWNLOAD_TOKEN_SECRET`
5. Deploy atau redeploy project.

### Catatan Production

- gunakan `DOWNLOAD_TOKEN_SECRET` yang panjang dan acak
- jangan publikasikan aplikasi ini secara luas tanpa auth tambahan
- lakukan pengujian pada file kecil terlebih dahulu sebelum menguji operasi destructive

## Ringkasan Workflow Teknis

Secara arsitektural, project ini bekerja dengan pola berikut:

- React mengelola state UI dan memanggil endpoint API
- endpoint API memanggil shared SSH core
- SSH core menggunakan `node-ssh` dan SFTP untuk operasi file
- local development memakai Express
- production serverless memakai Vercel Functions
- build frontend dikerjakan oleh Vite

Dengan struktur ini, codebase tetap relatif kecil, tetapi cukup fleksibel untuk development lokal maupun deployment cloud sederhana.
