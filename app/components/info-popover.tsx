"use client";

import { useState } from "react";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Box, IconButton, Popover } from "@mui/material";

type InfoPopoverProps = {
  children: React.ReactNode;
  ariaLabel?: string;
};

export function InfoPopover({ children, ariaLabel = "Mas informacion" }: InfoPopoverProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        size="small"
        aria-label={ariaLabel}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <InfoOutlinedIcon fontSize="small" />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { maxWidth: 320, p: 2, borderRadius: "16px" } } }}
      >
        <Box sx={{ "& p": { m: 0, mb: 1 }, "& p:last-child": { mb: 0 } }}>{children}</Box>
      </Popover>
    </>
  );
}
