"use client";

import { useRouter } from "next/navigation";
import { Box, Stack, Typography } from "@mui/material";

import { ProfileForm } from "@/app/components/profile-form";

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 4,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 480 }}>
        <Stack spacing={3}>
          <Stack spacing={0.5} sx={{ textAlign: "center" }}>
            <Typography variant="h4">Ultimo paso</Typography>
          </Stack>
          <ProfileForm
            mode="onboarding"
            onCompleted={() => {
              router.push("/dashboard");
              router.refresh();
            }}
          />
        </Stack>
      </Box>
    </Box>
  );
}
