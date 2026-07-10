import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#6D5DFB",
      dark: "#4C3FE0",
      light: "#A79CFC",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#FF6B6B",
    },
    background: {
      default: "#F1F1FA",
      paper: "#ffffff",
    },
    success: {
      main: "#16A34A",
    },
    error: {
      main: "#EF4444",
    },
    warning: {
      main: "#D97706",
    },
    text: {
      primary: "#161329",
      secondary: "#54506B",
    },
    divider: "rgba(84, 80, 107, 0.14)",
  },
  shape: {
    borderRadius: 20,
  },
  typography: {
    fontFamily: "var(--font-manrope), system-ui, sans-serif",
    h4: {
      fontFamily: "var(--font-space-grotesk), var(--font-manrope), sans-serif",
      fontWeight: 700,
      letterSpacing: "-0.03em",
      fontSize: "1.7rem",
    },
    h5: {
      fontFamily: "var(--font-space-grotesk), var(--font-manrope), sans-serif",
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h6: {
      fontFamily: "var(--font-space-grotesk), var(--font-manrope), sans-serif",
      fontWeight: 700,
      letterSpacing: "-0.01em",
    },
    subtitle1: {
      fontWeight: 700,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(22, 19, 41, 0.05)",
          boxShadow: "0 10px 30px rgba(31, 25, 84, 0.06)",
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: "16px 18px",
          "&:last-child": {
            paddingBottom: 16,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 700,
          textTransform: "none",
          paddingLeft: 18,
          paddingRight: 18,
        },
        sizeLarge: {
          paddingTop: 12,
          paddingBottom: 12,
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: "0 12px 24px rgba(76, 63, 224, 0.35)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          textTransform: "none",
          fontWeight: 700,
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          padding: 3,
          backgroundColor: "rgba(109, 93, 251, 0.08)",
          gap: 2,
        },
        grouped: {
          border: "none !important",
          margin: "0 !important",
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
      },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 16,
          },
        },
      },
    },
  },
});
