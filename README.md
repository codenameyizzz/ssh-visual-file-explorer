# SSH Visual File Explorer

Web app untuk browse, baca, edit, hapus, dan download file/folder dari server remote via SSH tanpa perlu `scp` manual.

## Arsitektur

- `server.ts`: Express server untuk local development.
- `api/ssh/*.ts`: Vercel Functions untuk deployment serverless di Vercel.
- `src/`: React frontend untuk form koneksi, browser direktori, dan editor file.
- `src/server/core.ts`: logika SSH bersama yang dipakai oleh local server dan Vercel Functions.
- Download folder dilakukan dengan `tar -czf` di server remote, jadi host target sebaiknya Linux/Unix dan memiliki utilitas `tar`.

## Prasyarat Lokal

- Node.js 20+ disarankan
- npm 10+
- Akses SSH ke host remote

## Menjalankan Lokal

1. Install dependensi:
   `npm install`
2. Opsional: salin `.env.example` menjadi `.env` bila ingin mengganti port atau host bind.
3. Jalankan development server:
   `npm run dev`
4. Buka:
   `http://localhost:3000`

Secara default aplikasi tidak membutuhkan API key apa pun. Konfigurasi environment yang tersedia:

```env
PORT=3000
HOST=0.0.0.0
DISABLE_HMR=false
DOWNLOAD_TOKEN_SECRET=change-this-to-a-long-random-secret
```

## Script

- `npm run dev`: jalankan Express + Vite dalam mode development
- `npm run lint`: type-check TypeScript
- `npm run build`: build frontend dan bundle server untuk production
- `npm run start`: jalankan hasil build production dari `dist/server.cjs`
- `npm run clean`: hapus artefak build

## Deploy ke Vercel Hobby

Arsitektur sekarang sudah disiapkan untuk Vercel Hobby:

- frontend dibuild sebagai static Vite app
- backend SSH berjalan sebagai Vercel Functions di `api/ssh/*`
- download ticket tidak lagi disimpan di memory proses, tetapi dienkripsi dan dibatasi masa aktifnya

Langkah deploy:

1. Push project ini ke GitHub/GitLab/Bitbucket.
2. Import project ke Vercel.
3. Pastikan framework terdeteksi sebagai `Vite`.
4. Set environment variable production:
   `DOWNLOAD_TOKEN_SECRET`
5. Deploy.

Nilai `DOWNLOAD_TOKEN_SECRET` sebaiknya panjang, acak, dan unik. Contoh aman:

```txt
openssl rand -base64 32
```

Atau di PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Batasan di Vercel Hobby

- Vercel Functions bersifat serverless, jadi koneksi SSH dibuat ulang per request.
- Download file/folder besar tetap berpotensi terkena batas durasi atau limit platform Vercel.
- Karena backend akan berjalan di infrastruktur Vercel, private key atau password SSH user memang transit ke function backend milik deployment Anda. Jangan deploy ini ke project publik multi-user tanpa lapisan auth tambahan.

## Catatan Operasional

- Kredensial SSH dikirim ke backend agar backend bisa membuat koneksi SSH/SFTP ke host remote.
- Opsi simpan browser sekarang hanya menyimpan host, username, port, dan mode auth. Private key, password, dan passphrase tidak disimpan ke localStorage.
- File di atas 15 MB tidak dibuka di editor web dan sebaiknya di-download.
- Operasi hapus tidak lagi memakai shell `rm -rf`, tetapi recursive delete via SFTP agar lebih aman dari command injection.
