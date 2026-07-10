"use client";

import { Stack } from "@mui/material";

import { PageHero } from "@/app/components/page-hero";
import { ProfileForm } from "@/app/components/profile-form";

export default function ProfilePage() {
  return (
    <Stack spacing={2}>
      <PageHero
        title="Perfil"
        subtitle="Tus datos y como te identifica la IA en los comprobantes."
      />
      <ProfileForm mode="settings" />
    </Stack>
  );
}
