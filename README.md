# SSH Visual File Explorer

Web app untuk browse, baca, edit, hapus, dan download file/folder dari server remote via SSH tanpa perlu `scp` manual.

## Arsitektur

- `server.ts`: Express server yang menangani API SSH dan juga menjalankan Vite middleware saat mode development.
- `src/`: React frontend untuk form koneksi, browser direktori, dan editor file.
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
```

## Script

- `npm run dev`: jalankan Express + Vite dalam mode development
- `npm run lint`: type-check TypeScript
- `npm run build`: build frontend dan bundle server untuk production
- `npm run start`: jalankan hasil build production dari `dist/server.cjs`
- `npm run clean`: hapus artefak build

## Catatan Operasional

- Kredensial SSH dikirim ke backend lokal ini agar backend bisa membuat koneksi SSH/SFTP ke host remote.
- Jika opsi "Keep details saved in browser local storage" diaktifkan, detail koneksi akan tersimpan di browser lokal.
- File di atas 15 MB tidak dibuka di editor web dan sebaiknya di-download.
