'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import AddProductView from './AddProductView';

interface AddProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddProductDialog({ isOpen, onClose }: AddProductDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="product-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="product-modal-content add-product-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="product-modal-close"
          onClick={onClose}
          aria-label="Chiudi"
        >
          ✕
        </button>
        <AddProductView onClose={onClose} isModal={true} />
      </div>
    </div>,
    document.body
  );
}
