"use client";

import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import RepeatOutlinedIcon from "@mui/icons-material/RepeatOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import SouthOutlinedIcon from "@mui/icons-material/SouthOutlined";
import NorthOutlinedIcon from "@mui/icons-material/NorthOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import {
  AppBar,
  Backdrop,
  Badge,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Drawer,
  Fab,
  IconButton,
  Stack,
  Paper,
  Toolbar,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ListSkeleton } from "@/app/components/list-skeleton";
import { apiFetch } from "@/lib/client/http";
import { NotificationDto } from "@/lib/shared/types";

type NotificationsResponse = {
  notifications: NotificationDto[];
  nextCursor: string | null;
  unreadCount: number;
};

type MobileShellProps = {
  children: React.ReactNode;
};

const NAV_ITEMS = [
  {
    label: "Inicio",
    href: "/dashboard",
    icon: <AccountBalanceWalletOutlinedIcon />,
  },
  {
    label: "Movs",
    href: "/transactions",
    icon: <ReceiptLongOutlinedIcon />,
  },
  {
    label: "Revision",
    href: "/reviews",
    icon: <FactCheckOutlinedIcon />,
  },
  {
    label: "Config",
    href: "/config",
    icon: <SettingsOutlinedIcon />,
  },
];

// Positioned along an upward arc (in degrees, 0 = pointing right, 90 = straight
// up, 180 = pointing left) so they fan out around the central button instead
// of stacking straight up.
const QUICK_ACTIONS = [
  {
    key: "expense",
    label: "Gasto",
    icon: <SouthOutlinedIcon fontSize="small" />,
    color: "#EF4444",
    href: "/quick?direction=expense",
    angle: 15,
  },
  {
    key: "income",
    label: "Ingreso",
    icon: <NorthOutlinedIcon fontSize="small" />,
    color: "#16A34A",
    href: "/quick?direction=income",
    angle: 65,
  },
  {
    key: "transfer",
    label: "Transferencia",
    icon: <SwapHorizOutlinedIcon fontSize="small" />,
    color: "#0EA5E9",
    href: "/accounts?action=transfer",
    angle: 115,
  },
  {
    key: "adjust",
    label: "Ajustar saldo",
    icon: <TuneOutlinedIcon fontSize="small" />,
    color: "#D97706",
    href: "/accounts?action=adjust",
    angle: 165,
  },
];

const ARC_RADIUS = 118;

// Shown above the arc as quick-access cards to sections that aren't part of
// the daily gasto/ingreso/transferencia/ajuste flow but are still reached
// often enough to deserve a shortcut from the dial.
const QUICK_LINKS = [
  {
    key: "installments",
    label: "Cuotas",
    href: "/installments",
    icon: <PaymentsOutlinedIcon fontSize="small" />,
  },
  {
    key: "recurring",
    label: "Recurrentes",
    href: "/recurring-expenses",
    icon: <RepeatOutlinedIcon fontSize="small" />,
  },
  {
    key: "debts",
    label: "Deudas",
    href: "/debts",
    icon: <HandshakeOutlinedIcon fontSize="small" />,
  },
  {
    key: "analysis",
    label: "Analisis",
    href: "/analysis",
    icon: <InsightsOutlinedIcon fontSize="small" />,
  },
  {
    key: "shopping",
    label: "Súper",
    href: "/shopping",
    icon: <ShoppingCartOutlinedIcon fontSize="small" />,
  },
];

function getNavValue(pathname: string) {
  const found = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return found?.href ?? "/dashboard";
}

export function MobileShell({ children }: MobileShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navValue = getNavValue(pathname);
  const [dialOpen, setDialOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = async (cursor: string | null) => {
    try {
      const params = new URLSearchParams();
      if (cursor) {
        params.set("cursor", cursor);
      }
      const query = params.toString();
      const response = await apiFetch<NotificationsResponse>(
        `/api/v1/notifications${query ? `?${query}` : ""}`
      );
      setNotifications((previous) =>
        cursor ? [...previous, ...response.notifications] : response.notifications
      );
      setUnreadCount(response.unreadCount);
      setNextCursor(response.nextCursor);
    } catch {
      // Notifications are a convenience layer — a failed fetch shouldn't block the app shell.
    }
  };

  const goTo = (href: string) => {
    setDialOpen(false);
    router.push(href);
  };

  useEffect(() => {
    // Los setState de loadNotifications corren después de un await, no
    // sincrónicamente; la regla no ve el límite async dentro del closure.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNotifications(null);
  }, []);

  useEffect(() => {
    if (!notificationsOpen || !nextCursor) {
      return;
    }
    const node = sentinelRef.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          setLoadingMore(true);
          void loadNotifications(nextCursor).finally(() => setLoadingMore(false));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [notificationsOpen, nextCursor, loadingMore]);

  const openNotification = async (notification: NotificationDto) => {
    setNotificationsOpen(false);
    if (!notification.isRead) {
      try {
        await apiFetch(`/api/v1/notifications/${notification.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isRead: true }),
        });
        setNotifications((previous) =>
          previous.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item))
        );
        setUnreadCount((previous) => Math.max(0, previous - 1));
      } catch {
        // Ignore — worst case the notification stays marked unread until next refresh.
      }
    }
    if (notification.linkHref) {
      router.push(notification.linkHref);
    }
  };

  const handleDismissNotification = async (
    notification: NotificationDto,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();
    setNotifications((previous) => previous.filter((item) => item.id !== notification.id));
    if (!notification.isRead) {
      setUnreadCount((previous) => Math.max(0, previous - 1));
    }
    try {
      await apiFetch(`/api/v1/notifications/${notification.id}`, { method: "DELETE" });
    } catch {
      void loadNotifications(null);
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((previous) => previous.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    try {
      await apiFetch("/api/v1/notifications", {
        method: "PATCH",
        body: JSON.stringify({ action: "read_all" }),
      });
    } catch {
      void loadNotifications(null);
    }
  };

  return (
    <Box sx={{ minHeight: "100dvh", pb: "calc(88px + 1.5rem + env(safe-area-inset-bottom))" }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "rgba(241,241,250,0.82)",
          backdropFilter: "blur(10px)",
        }}
      >
        <Toolbar sx={{ minHeight: "64px !important", px: 1.5 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", width: "100%", justifyContent: "space-between" }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: "12px",
                  display: "grid",
                  placeItems: "center",
                  color: "white",
                  background: "linear-gradient(135deg, #7c6bfc, #4c3fe0)",
                }}
              >
                <AutoFixHighOutlinedIcon fontSize="small" />
              </Box>
              <Typography variant="h6" component="h1">
                CuentasClaras
              </Typography>
            </Stack>
            <IconButton
              onClick={() => {
                setNotificationsOpen(true);
                void loadNotifications(null);
              }}
              aria-label="Notificaciones"
            >
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsOutlinedIcon />
              </Badge>
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ px: { xs: 1.5, sm: 2.5 }, py: 2.2 }}>
        <div className="app-main-container">{children}</div>
      </Box>

      <Backdrop
        open={dialOpen}
        sx={{ zIndex: 1150, backgroundColor: "rgba(15, 23, 42, 0.45)" }}
        onClick={() => setDialOpen(false)}
      />

      <Box
        sx={{
          position: "fixed",
          left: 16,
          right: 16,
          top: "calc(76px + env(safe-area-inset-top))",
          zIndex: 1151,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          opacity: dialOpen ? 1 : 0,
          transform: dialOpen ? "translateY(0)" : "translateY(-12px)",
          pointerEvents: dialOpen ? "auto" : "none",
          transition: "opacity 0.2s ease, transform 0.2s ease",
        }}
      >
        {QUICK_LINKS.map((link) => (
          <Box
            key={link.key}
            onClick={() => goTo(link.href)}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.5,
              py: 1.2,
              px: 0.5,
              borderRadius: "16px",
              bgcolor: "rgba(255,255,255,0.96)",
              boxShadow: "0 10px 24px rgba(31, 25, 84, 0.16)",
              cursor: "pointer",
              "&:hover": { bgcolor: "#fff" },
            }}
          >
            <Box sx={{ color: "primary.main", display: "flex" }}>{link.icon}</Box>
            <Typography variant="caption" sx={{ fontWeight: 700, textAlign: "center", lineHeight: 1.1 }}>
              {link.label}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          position: "fixed",
          left: "50%",
          bottom: "calc(30px + 1.5rem + env(safe-area-inset-bottom))",
          zIndex: 1151,
          width: 0,
          height: 0,
        }}
      >
        {QUICK_ACTIONS.map((action, index) => {
          const radians = (action.angle * Math.PI) / 180;
          const x = Math.cos(radians) * ARC_RADIUS;
          const y = -Math.sin(radians) * ARC_RADIUS;

          return (
            <Box
              key={action.key}
              sx={{
                position: "absolute",
                left: 0,
                top: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.5,
                transform: dialOpen
                  ? `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(1)`
                  : "translate(-50%, -50%) scale(0.3)",
                opacity: dialOpen ? 1 : 0,
                pointerEvents: dialOpen ? "auto" : "none",
                transition: `transform 0.22s ease ${index * 0.03}s, opacity 0.18s ease ${index * 0.03}s`,
              }}
            >
              <Fab
                size="medium"
                onClick={() => goTo(action.href)}
                aria-label={action.label}
                sx={{
                  width: 60,
                  height: 60,
                  bgcolor: action.color,
                  color: "#fff",
                  boxShadow: "0 8px 18px rgba(31, 25, 84, 0.28)",
                  "&:hover": { bgcolor: action.color, filter: "brightness(0.92)" },
                }}
              >
                {action.icon}
              </Fab>
              <Typography
                variant="caption"
                sx={{
                  color: "#fff",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  textShadow: "0 1px 4px rgba(0,0,0,0.45)",
                }}
              >
                {action.label}
              </Typography>
            </Box>
          );
        })}

        <Fab
          color="primary"
          onClick={() => setDialOpen((previous) => !previous)}
          aria-label="Atajo rapido"
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 72,
            height: 72,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 10px 24px rgba(76, 63, 224, 0.4)",
          }}
        >
          <AddOutlinedIcon
            sx={{
              fontSize: 32,
              transform: dialOpen ? "rotate(135deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          />
        </Fab>
      </Box>

      <Paper
        elevation={0}
        sx={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          // Sin z-index explícito, los labels de los TextField de MUI
          // (z-index: 1) se pintan por encima de esta barra y el texto de los
          // formularios "atraviesa" el menú al scrollear.
          zIndex: "appBar",
          borderRadius: "20px 20px 0 0",
          overflow: "hidden",
          bgcolor: "rgba(255,255,255,0.96)",
          boxShadow: "0 -8px 24px rgba(31, 25, 84, 0.12)",
          backdropFilter: "blur(12px)",
          pb: "calc(1rem + env(safe-area-inset-bottom))",
        }}
      >
        <BottomNavigation showLabels value={navValue} sx={{ bgcolor: "transparent" }}>
          <BottomNavigationAction
            key={NAV_ITEMS[0].href}
            value={NAV_ITEMS[0].href}
            label={NAV_ITEMS[0].label}
            icon={NAV_ITEMS[0].icon}
            LinkComponent={Link}
            href={NAV_ITEMS[0].href}
            sx={{ "&.Mui-selected": { color: "primary.main" } }}
          />
          <BottomNavigationAction
            key={NAV_ITEMS[1].href}
            value={NAV_ITEMS[1].href}
            label={NAV_ITEMS[1].label}
            icon={NAV_ITEMS[1].icon}
            LinkComponent={Link}
            href={NAV_ITEMS[1].href}
            sx={{ "&.Mui-selected": { color: "primary.main" } }}
          />
          <BottomNavigationAction
            disabled
            disableRipple
            value="__spacer__"
            label=""
            icon={<Box sx={{ width: 24, height: 24 }} />}
            sx={{ opacity: 0, pointerEvents: "none" }}
          />
          <BottomNavigationAction
            key={NAV_ITEMS[2].href}
            value={NAV_ITEMS[2].href}
            label={NAV_ITEMS[2].label}
            icon={NAV_ITEMS[2].icon}
            LinkComponent={Link}
            href={NAV_ITEMS[2].href}
            sx={{ "&.Mui-selected": { color: "primary.main" } }}
          />
          <BottomNavigationAction
            key={NAV_ITEMS[3].href}
            value={NAV_ITEMS[3].href}
            label={NAV_ITEMS[3].label}
            icon={NAV_ITEMS[3].icon}
            LinkComponent={Link}
            href={NAV_ITEMS[3].href}
            sx={{ "&.Mui-selected": { color: "primary.main" } }}
          />
        </BottomNavigation>
      </Paper>

      <Box sx={{ height: "calc(18px + env(safe-area-inset-bottom))" }} />

      <Drawer
        anchor="bottom"
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              p: 2,
              pb: "calc(16px + env(safe-area-inset-bottom))",
              maxHeight: "70vh",
            },
          },
        }}
      >
        <Stack spacing={1.2} sx={{ overflowY: "auto" }}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="h6">Notificaciones</Typography>
            {notifications.some((item) => !item.isRead) ? (
              <Button size="small" onClick={() => void handleMarkAllRead()}>
                Marcar todas como leidas
              </Button>
            ) : null}
          </Stack>
          <Stack spacing={1}>
            {notifications.length ? (
              notifications.map((notification) => (
                <Box
                  key={notification.id}
                  onClick={() => void openNotification(notification)}
                  sx={{
                    p: 1.2,
                    borderRadius: "14px",
                    bgcolor: notification.isRead ? "rgba(226, 232, 240, 0.3)" : "rgba(109, 93, 251, 0.1)",
                    cursor: "pointer",
                    "&:hover": { opacity: 0.85 },
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 1,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: notification.isRead ? 500 : 700 }}>
                      {notification.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(notification.createdAt).toLocaleDateString("es-AR")}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    aria-label="Descartar notificacion"
                    onClick={(event) => void handleDismissNotification(notification, event)}
                  >
                    <CloseOutlinedIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No tenes notificaciones.
              </Typography>
            )}
            {nextCursor ? (
              <Box ref={sentinelRef}>{loadingMore ? <ListSkeleton rows={2} height={48} /> : null}</Box>
            ) : null}
          </Stack>
        </Stack>
      </Drawer>
    </Box>
  );
}
