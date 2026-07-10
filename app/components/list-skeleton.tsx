"use client";

import { Skeleton, Stack } from "@mui/material";

type ListSkeletonProps = {
  rows?: number;
  height?: number;
};

export function ListSkeleton({ rows = 4, height = 64 }: ListSkeletonProps) {
  return (
    <Stack spacing={1}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} variant="rounded" height={height} sx={{ borderRadius: "16px" }} />
      ))}
    </Stack>
  );
}
