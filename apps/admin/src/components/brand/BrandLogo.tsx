import Image from 'next/image';
import { brandAsset } from '@/lib/brand';
import styles from './BrandLogo.module.css';

type BrandLogoProps = {
  compact?: boolean;
  inverse?: boolean;
};

export function BrandLogo({ compact = false, inverse = false }: Readonly<BrandLogoProps>) {
  const className = [
    styles.brand,
    compact ? styles.compact : '',
    inverse ? styles.inverse : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} aria-label="ایران یراق، مرکز عملیات">
      {compact ? <Image className={styles.mark} src={brandAsset('mark-128.webp')} alt="" width={44} height={44} unoptimized /> :
        <Image className={styles.wordmark} src={brandAsset('wordmark-864.webp')} alt="ایران یراق" width={216} height={72} unoptimized />}
      <span className={styles.copy}>
        <span>مرکز عملیات</span>
      </span>
    </div>
  );
}
