/** Print only after the local logo and Persian fonts have loaded; failure is explicit. */
export async function prepareInvoicePrint(sheet: HTMLElement): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([
        ...Array.from(sheet.querySelectorAll('img')).map(async image => {
          if (image.decode) await image.decode();
          if (!image.complete || image.naturalWidth === 0) throw new Error('Print image unavailable.');
        }),
        ...[400, 700].map(async weight => {
          const faces = await sheet.ownerDocument.fonts.load(`${weight} 12px "Iraniyaragh Sans"`, 'ایران یراق');
          if (faces.length === 0 || faces.some(face => face.status !== 'loaded')) throw new Error('Print font unavailable.');
        }),
      ]),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Print assets unavailable.')), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}
