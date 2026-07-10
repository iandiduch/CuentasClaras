"use client";

import { Box, Stack, Typography } from "@mui/material";

type PageHeroProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export function PageHero({ title, subtitle, action }: PageHeroProps) {
  return (
    <Box
      sx={{
        px: 2.4,
        py: 2.2,
        borderRadius: "24px",
        bgcolor: "background.paper",
        border: "1px solid rgba(22, 19, 41, 0.05)",
        boxShadow: "0 10px 30px rgba(31, 25, 84, 0.06)",
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ lineHeight: 1.1 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
      </Stack>
    </Box>
  );
}
