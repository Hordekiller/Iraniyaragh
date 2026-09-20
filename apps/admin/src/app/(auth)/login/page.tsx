/**
 * The canonical admin sign-in route always uses the real staff password + TOTP
 * contract. `/login/staff` remains as a backwards-compatible alias for links
 * and bookmarks created before #278.
 */
export { default } from './staff/page';
