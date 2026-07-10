"use client";

import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";

import { CATEGORY_ICON_LABELS, CATEGORY_ICONS } from "@/app/components/category-icons";

type CategoryIconPickerProps = {
  value: string | null;
  onChange: (icon: string | null) => void;
  color?: string;
};

export function CategoryIconPicker({ value, onChange, color }: CategoryIconPickerProps) {
  return (
    <Stack spacing={0.8}>
      <Typography variant="caption" color="text.secondary">
        Icono
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))",
          gap: 0.8,
        }}
      >
        {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => {
          const selected = value === key;
          return (
            <Tooltip key={key} title={CATEGORY_ICON_LABELS[key] ?? key}>
              <IconButton
                onClick={() => onChange(selected ? null : key)}
                sx={{
                  borderRadius: "10px",
                  bgcolor: selected ? (color ?? "primary.main") : "rgba(22, 19, 41, 0.05)",
                  color: selected ? "#fff" : "text.secondary",
                  "&:hover": {
                    bgcolor: selected ? (color ?? "primary.main") : "rgba(22, 19, 41, 0.1)",
                  },
                }}
              >
                <Icon fontSize="small" />
              </IconButton>
            </Tooltip>
          );
        })}
      </Box>
    </Stack>
  );
}
