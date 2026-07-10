import CardGiftcardOutlinedIcon from "@mui/icons-material/CardGiftcardOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import FlightTakeoffOutlinedIcon from "@mui/icons-material/FlightTakeoffOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import PetsOutlinedIcon from "@mui/icons-material/PetsOutlined";
import RestaurantOutlinedIcon from "@mui/icons-material/RestaurantOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import SportsBasketballOutlinedIcon from "@mui/icons-material/SportsBasketballOutlined";
import WalletOutlinedIcon from "@mui/icons-material/WalletOutlined";
import WifiOutlinedIcon from "@mui/icons-material/WifiOutlined";
import WorkOutlineOutlinedIcon from "@mui/icons-material/WorkOutlineOutlined";
import type { SvgIconProps } from "@mui/material";
import type { ComponentType } from "react";

type IconComponent = ComponentType<SvgIconProps>;

export const CATEGORY_ICONS: Record<string, IconComponent> = {
  supermarket: ShoppingCartOutlinedIcon,
  restaurant: RestaurantOutlinedIcon,
  home: HomeOutlinedIcon,
  car: DirectionsCarOutlinedIcon,
  health: LocalHospitalOutlinedIcon,
  entertainment: MovieOutlinedIcon,
  utilities: WifiOutlinedIcon,
  salary: WorkOutlineOutlinedIcon,
  gift: CardGiftcardOutlinedIcon,
  travel: FlightTakeoffOutlinedIcon,
  education: SchoolOutlinedIcon,
  pet: PetsOutlinedIcon,
  sports: SportsBasketballOutlinedIcon,
  savings: SavingsOutlinedIcon,
  wallet: WalletOutlinedIcon,
};

export const CATEGORY_ICON_LABELS: Record<string, string> = {
  supermarket: "Supermercado",
  restaurant: "Restaurante",
  home: "Hogar",
  car: "Auto",
  health: "Salud",
  entertainment: "Entretenimiento",
  utilities: "Servicios",
  salary: "Sueldo",
  gift: "Regalos",
  travel: "Viajes",
  education: "Educacion",
  pet: "Mascotas",
  sports: "Deporte",
  savings: "Ahorro",
  wallet: "Billetera",
};

export function CategoryIcon({
  icon,
  ...props
}: { icon: string | null } & SvgIconProps) {
  const Icon = (icon && CATEGORY_ICONS[icon]) || CategoryOutlinedIcon;
  return <Icon {...props} />;
}
