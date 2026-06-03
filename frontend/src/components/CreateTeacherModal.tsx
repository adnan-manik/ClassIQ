"use client";

import { useState } from "react";
import Modal from "./Modal";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";

interface CreateTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateTeacherModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateTeacherModalProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = await createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Not authenticated");
        return;
      }

      const response = await fetch("/api/institution/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          full_name: fullName,
          email: email,
          role: "teacher",
          mode: "invite",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to create teacher");
      }

      setFullName("");
      setEmail("");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Teacher" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            className="rounded-lg p-4 text-sm"
            style={{
              backgroundColor: "#FEE2E2",
              color: "#991B1B",
              border: "1px solid #FECACA",
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="fullName"
            className="block text-sm font-semibold mb-2"
            style={{ color: BRAND.textHeading }}
          >
            Full Name
          </label>
          <input
            type="text"
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Dr. Jane Smith"
            className="w-full px-4 py-2 rounded-lg border outline-none transition"
            style={{
              borderColor: BRAND.cardBorder,
              color: BRAND.text,
            }}
            onFocus={(e) =>
              (e.target.style.borderColor = BRAND.teal)
            }
            onBlur={(e) =>
              (e.target.style.borderColor = BRAND.cardBorder)
            }
            required
            disabled={loading}
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-semibold mb-2"
            style={{ color: BRAND.textHeading }}
          >
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="w-full px-4 py-2 rounded-lg border outline-none transition"
            style={{
              borderColor: BRAND.cardBorder,
              color: BRAND.text,
            }}
            onFocus={(e) =>
              (e.target.style.borderColor = BRAND.teal)
            }
            onBlur={(e) =>
              (e.target.style.borderColor = BRAND.cardBorder)
            }
            required
            disabled={loading}
          />
          <p
            className="text-xs mt-1"
            style={{ color: BRAND.textMuted }}
          >
            An invitation will be sent to set up their account and complete their teaching-style survey.
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg font-semibold transition border"
            style={{
              borderColor: BRAND.cardBorder,
              color: BRAND.text,
            }}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 rounded-lg font-semibold text-white transition"
            style={{ backgroundColor: BRAND.teal }}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Teacher"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
