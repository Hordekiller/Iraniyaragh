import { createContext } from "react";
import type { ReactNode } from "react";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  oldPrice?: number;
  image: string;
  qty: number;
}

export interface CartContextValue {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (item: Omit<CartItem, "qty">, qty?: number) => void;
  removeFromCart: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  totalCount: number;
  totalPrice: number;
}

export const CartContext = createContext<CartContextValue | null>(null);

export type CartProviderProps = { children: ReactNode };
