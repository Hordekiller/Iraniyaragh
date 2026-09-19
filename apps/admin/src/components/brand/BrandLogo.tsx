import styles from './BrandLogo.module.css';

type BrandLogoProps = {
  compact?: boolean;
  inverse?: boolean;
};

export function BrandLogo({ compact = false, inverse = false }: BrandLogoProps) {
  const className = [
    styles.brand,
    compact ? styles.compact : '',
    inverse ? styles.inverse : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} aria-label="ایران یراق، مرکز عملیات">
      <span className={styles.mark} aria-hidden="true">
        آی
      </span>
      <span className={styles.copy}>
        <strong>ایران یراق</strong>
        <span>مرکز عملیات</span>
      </span>
    </div>
  );
}
