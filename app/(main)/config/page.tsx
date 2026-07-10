"use client";

import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import RepeatOutlinedIcon from "@mui/icons-material/RepeatOutlined";
import {
  Card,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
} from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHero } from "@/app/components/page-hero";
import { apiFetch } from "@/lib/client/http";

const CONFIG_ITEMS = [
  {
    label: "Perfil",
    description: "Tus datos y como te identifica la IA en los comprobantes.",
    href: "/config/profile",
    icon: <PersonOutlinedIcon />,
  },
  {
    label: "Cuentas",
    description: "Administra cuentas, ajusta saldos y transferi entre ellas.",
    href: "/accounts",
    icon: <AccountBalanceOutlinedIcon />,
  },
  {
    label: "Cuotas",
    description: "Compras en cuotas y su progreso de pago.",
    href: "/installments",
    icon: <PaymentsOutlinedIcon />,
  },
  {
    label: "Gastos recurrentes",
    description: "Servicios fijos que se generan solos cada mes.",
    href: "/recurring-expenses",
    icon: <RepeatOutlinedIcon />,
  },
  {
    label: "Deudas",
    description: "Quien te debe y a quien le debes, con recordatorios.",
    href: "/debts",
    icon: <HandshakeOutlinedIcon />,
  },
  {
    label: "Analisis",
    description: "Tendencias, categorias dominantes y recomendaciones.",
    href: "/analysis",
    icon: <InsightsOutlinedIcon />,
  },
  {
    label: "Categorias",
    description: "Crea, edita y decide que categorias entran al analisis.",
    href: "/categories",
    icon: <CategoryOutlinedIcon />,
  },
  {
    label: "Inbox",
    description: "Estado detallado de comprobantes en procesamiento.",
    href: "/inbox",
    icon: <PendingActionsOutlinedIcon />,
  },
];

export default function ConfigPage() {
  const router = useRouter();

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <Stack spacing={2}>
      <PageHero
        title="Configuracion"
        subtitle="Accede a categorias, cuentas, analisis e inbox desde un solo lugar."
      />

      <Card>
        <List disablePadding>
          {CONFIG_ITEMS.map((item) => (
            <ListItemButton key={item.href} component={Link} href={item.href}>
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} secondary={item.description} />
              <ChevronRightOutlinedIcon fontSize="small" color="disabled" />
            </ListItemButton>
          ))}
          <ListItemButton onClick={handleLogout}>
            <ListItemIcon>
              <LogoutOutlinedIcon />
            </ListItemIcon>
            <ListItemText primary="Cerrar sesion" />
          </ListItemButton>
        </List>
      </Card>
    </Stack>
  );
}
