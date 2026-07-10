"use client";

import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { Button, Dialog, DialogContent, IconButton } from "@mui/material";
import { useState } from "react";

type DocumentViewerProps = {
  documentId: string;
  mimeType?: string | null;
  label?: string;
  iconOnly?: boolean;
};

export function DocumentViewer({ documentId, mimeType, label, iconOnly }: DocumentViewerProps) {
  const [open, setOpen] = useState(false);
  const fileUrl = `/api/v1/documents/${documentId}/file`;
  const isImage = !mimeType || mimeType.startsWith("image/");

  if (!isImage) {
    return (
      <Button
        size="small"
        variant="outlined"
        component="a"
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
        startIcon={<ReceiptLongOutlinedIcon fontSize="small" />}
      >
        {label ?? "Ver comprobante"}
      </Button>
    );
  }

  return (
    <>
      {iconOnly ? (
        <IconButton size="small" onClick={() => setOpen(true)} title="Ver comprobante">
          <ReceiptLongOutlinedIcon fontSize="small" />
        </IconButton>
      ) : (
        <Button
          size="small"
          variant="outlined"
          startIcon={<ReceiptLongOutlinedIcon fontSize="small" />}
          onClick={() => setOpen(true)}
        >
          {label ?? "Ver comprobante"}
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogContent sx={{ p: 0, display: "flex", justifyContent: "center", bgcolor: "black" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl} alt="Comprobante" style={{ maxWidth: "100%", maxHeight: "80vh" }} />
        </DialogContent>
      </Dialog>
    </>
  );
}
