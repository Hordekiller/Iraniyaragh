/** Next public assets need the explicit deployed /admin prefix. No remote logo URL. */
export const brandAsset = (file: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/brand/${file}`;
