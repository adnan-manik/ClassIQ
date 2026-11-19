"use client";

import { X } from "lucide-react";
import { ReactNode } from "react";
import { BRAND } from "@/lib/brand";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  if (!isOpen) return null;

  const sizeClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
  }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={`relative bg-white rounded-3xl shadow-lg p-6 md:p-8 w-full mx-4 max-h-[90vh] overflow-y-auto ${sizeClass}`}
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2
            id="modal-title"
            className="text-2xl font-extrabold tracking-tight"
            style={{ color: BRAND.textHeading }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition"
            aria-label="Close modal"
          >
            <X size={20} style={{ color: BRAND.textMuted }} />
          </button>
        </div>

        {/* Content */}
        <div>{children}</div>
      </div>
    </div>
  );
}
