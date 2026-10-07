/** Compress before uploading; large image bytes never travel with question JSON. */
export async function uploadQuestionImage(file: File, upload: (dataUrl: string) => Promise<string>) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Gunakan gambar JPG, PNG, atau WebP.");
  if (file.size > 1_500_000) throw new Error("Ukuran gambar maksimal 1,5 MB.");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Gambar belum dapat diproses.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/webp", 0.85);
    if (data.length > 666000) data = canvas.toDataURL("image/webp", 0.65);
    if (data.length > 666000) throw new Error("Gambar masih terlalu besar setelah kompresi. Gunakan gambar dengan resolusi lebih kecil.");
    return upload(data);
  } finally { image.close(); }
}
