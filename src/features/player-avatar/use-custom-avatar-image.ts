"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getCustomAvatarOutlineColorFromBlob } from "@/features/player-avatar/custom-avatar-color";
import {
  createCustomAvatarSyncPayload,
  readPersistedCustomAvatarImage,
  writePersistedCustomAvatarImage,
  type CustomAvatarSyncPayload,
} from "@/features/player-avatar/custom-avatar-storage";

export function useCustomAvatarImage() {
  const objectUrlRef = useRef<string | null>(null);
  const [customAvatarImageUrl, setCustomAvatarImageUrl] = useState<string | null>(null);
  const [customAvatarOutlineColor, setCustomAvatarOutlineColor] = useState<string | null>(null);
  const [customAvatarSyncPayload, setCustomAvatarSyncPayload] = useState<CustomAvatarSyncPayload | null>(null);

  const replaceCustomAvatarBlob = useCallback((blob: Blob | null, outlineColor: string | null = null) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (!blob) {
      setCustomAvatarImageUrl(null);
      setCustomAvatarOutlineColor(null);
      setCustomAvatarSyncPayload(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;
    setCustomAvatarImageUrl(objectUrl);
    setCustomAvatarOutlineColor(outlineColor);
    setCustomAvatarSyncPayload(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readPersistedCustomAvatarImage().then((record) => {
      if (cancelled) return;
      if (!record) {
        replaceCustomAvatarBlob(null);
        return;
      }
      replaceCustomAvatarBlob(record.blob, record.outlineColor ?? null);
      void createCustomAvatarSyncPayload(record).then((payload) => {
        if (cancelled) return;
        setCustomAvatarSyncPayload(payload);
      });
      if (!record.outlineColor) {
        void getCustomAvatarOutlineColorFromBlob(record.blob).then((outlineColor) => {
          if (cancelled) return;
          setCustomAvatarOutlineColor(outlineColor);
          void writePersistedCustomAvatarImage(record.blob, outlineColor, record.updatedAt).then((updatedRecord) => {
            if (cancelled) return;
            void createCustomAvatarSyncPayload(updatedRecord ?? record).then((payload) => {
              if (cancelled) return;
              setCustomAvatarSyncPayload(payload);
            });
          });
        });
      }
    });
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [replaceCustomAvatarBlob]);

  const saveCustomAvatarImage = useCallback(
    async (blob: Blob, outlineColor: string) => {
      const record = await writePersistedCustomAvatarImage(blob, outlineColor);
      if (!record) return false;
      replaceCustomAvatarBlob(record.blob, record.outlineColor ?? null);
      setCustomAvatarSyncPayload(await createCustomAvatarSyncPayload(record));
      return true;
    },
    [replaceCustomAvatarBlob],
  );

  return { customAvatarImageUrl, customAvatarOutlineColor, customAvatarSyncPayload, saveCustomAvatarImage };
}
