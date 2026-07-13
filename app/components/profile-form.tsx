"use client";

import { useEffect, useState } from "react";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { InboxApiHelp } from "@/app/components/inbox-api-help";
import { apiFetch } from "@/lib/client/http";

const IDENTITY_TYPE_OPTIONS = [
  { value: "person_name", label: "Nombre o alias" },
  { value: "tax_id", label: "CUIT / CUIL" },
  { value: "cbu", label: "CBU" },
  { value: "cvu", label: "CVU" },
  { value: "alias", label: "Alias bancario" },
  { value: "phone", label: "Telefono" },
  { value: "bank_account", label: "Numero de cuenta" },
  { value: "other", label: "Otro" },
] as const;

type IdentityType = (typeof IDENTITY_TYPE_OPTIONS)[number]["value"];

type Identity = {
  id: string;
  identityType: IdentityType;
  identityValue: string;
  isPrimary: boolean;
};

type Profile = {
  username: string;
  fullName: string | null;
  email: string | null;
  defaultCurrency: string;
  timezone: string;
};

function identityTypeLabel(type: IdentityType) {
  return IDENTITY_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

type ProfileFormProps = {
  mode?: "onboarding" | "settings";
  onCompleted?: () => void;
};

export function ProfileForm({ mode = "settings", onCompleted }: ProfileFormProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [identityType, setIdentityType] = useState<IdentityType>("tax_id");
  const [identityValue, setIdentityValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingIdentity, setAddingIdentity] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [profileResponse, identitiesResponse] = await Promise.all([
        apiFetch<{ profile: Profile }>("/api/v1/profile"),
        apiFetch<{ identities: Identity[] }>("/api/v1/profile/identities"),
      ]);
      setProfile(profileResponse.profile);
      setFullName(profileResponse.profile.fullName ?? "");
      setEmail(profileResponse.profile.email ?? "");
      setIdentities(identitiesResponse.identities);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el perfil");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await apiFetch("/api/v1/profile", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim() ? email.trim() : null,
        }),
      });
      setSaved(true);
      onCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el perfil");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddIdentity(event: React.FormEvent) {
    event.preventDefault();
    if (addingIdentity) return;
    setIdentityError(null);
    if (!identityValue.trim()) {
      return;
    }

    try {
      setAddingIdentity(true);
      const { identity } = await apiFetch<{ identity: Identity }>("/api/v1/profile/identities", {
        method: "POST",
        body: JSON.stringify({ identityType, identityValue: identityValue.trim() }),
      });
      setIdentities((current) => [...current, identity]);
      setIdentityValue("");
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : "No se pudo agregar el dato");
    } finally {
      setAddingIdentity(false);
    }
  }

  async function handleDeleteIdentity(id: string) {
    setIdentities((current) => current.filter((item) => item.id !== id));
    try {
      await apiFetch(`/api/v1/profile/identities/${id}`, { method: "DELETE" });
    } catch {
      void loadAll();
    }
  }

  if (loading || !profile) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={handleSaveProfile}>
            {mode === "onboarding" ? (
              <Stack spacing={0.5}>
                <Typography variant="h6">Contanos quien sos</Typography>
                <Typography variant="body2" color="text.secondary">
                  Con estos datos la IA puede reconocerte en tus comprobantes y
                  distinguir cuando vos sos quien envia o recibe el dinero.
                </Typography>
              </Stack>
            ) : null}

            {error ? <Alert severity="error">{error}</Alert> : null}
            {saved && mode === "settings" ? (
              <Alert severity="success" onClose={() => setSaved(false)}>
                Perfil guardado.
              </Alert>
            ) : null}

            <TextField
              label="Nombre completo"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
            <TextField
              label="Email (opcional)"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <Button type="submit" variant="contained" size="large" loading={saving}>
              {saving ? "Guardando..." : mode === "onboarding" ? "Continuar" : "Guardar cambios"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="subtitle1">Tus datos de identificacion</Typography>
              <Typography variant="body2" color="text.secondary">
                Agrega tu CUIT, CBU, alias u otros datos con los que aparecerias
                en un comprobante. Cuantos mas cargues, mejor te va a reconocer la IA.
              </Typography>
            </Stack>

            {identities.length ? (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                {identities.map((identity) => (
                  <Chip
                    key={identity.id}
                    label={`${identityTypeLabel(identity.identityType)}: ${identity.identityValue}`}
                    onDelete={() => handleDeleteIdentity(identity.id)}
                    deleteIcon={<DeleteOutlineIcon />}
                  />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Todavia no cargaste ningun dato.
              </Typography>
            )}

            {identityError ? <Alert severity="error">{identityError}</Alert> : null}

            <Stack
              component="form"
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              onSubmit={handleAddIdentity}
            >
              <TextField
                select
                label="Tipo"
                value={identityType}
                onChange={(event) => setIdentityType(event.target.value as IdentityType)}
                sx={{ minWidth: 180 }}
              >
                {IDENTITY_TYPE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Valor"
                value={identityValue}
                onChange={(event) => setIdentityValue(event.target.value)}
                fullWidth
              />
              <Button type="submit" variant="outlined" loading={addingIdentity}>
                {addingIdentity ? "Agregando..." : "Agregar"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {mode === "settings" ? (
        <>
          <ApiTokensSection />
          <InboxApiHelp />
        </>
      ) : null}
    </Stack>
  );
}

type ApiToken = {
  id: string;
  label: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

function ApiTokensSection() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [label, setLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadTokens();
  }, []);

  async function loadTokens() {
    try {
      const { tokens } = await apiFetch<{ tokens: ApiToken[] }>("/api/v1/profile/tokens");
      setTokens(tokens);
    } catch {
      // ignore, section still renders with empty state
    }
  }

  async function handleCreateToken(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setError(null);
    if (!label.trim()) {
      return;
    }
    try {
      setCreating(true);
      const result = await apiFetch<{ id: string; label: string; token: string }>(
        "/api/v1/profile/tokens",
        {
          method: "POST",
          body: JSON.stringify({ label: label.trim() }),
        }
      );
      setNewToken(result.token);
      setLabel("");
      void loadTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setTokens((current) => current.map((t) => (t.id === id ? { ...t, isActive: false } : t)));
    try {
      await apiFetch(`/api/v1/profile/tokens/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
      });
    } catch {
      void loadTokens();
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle1">Token para el endpoint de inbox</Typography>
            <Typography variant="body2" color="text.secondary">
              Usa este token para subir comprobantes por API (curl, atajos de
              iOS, scripts) sin compartir tu usuario y contrasena.
            </Typography>
          </Stack>

          {newToken ? (
            <Alert severity="success" sx={{ wordBreak: "break-all" }}>
              Copia este token ahora, no se va a volver a mostrar: <strong>{newToken}</strong>
            </Alert>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Stack
            component="form"
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            onSubmit={handleCreateToken}
          >
            <TextField
              label="Nombre del token (ej: iPhone)"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              fullWidth
            />
            <Button type="submit" variant="outlined" loading={creating}>
              {creating ? "Generando..." : "Generar token"}
            </Button>
          </Stack>

          {tokens.length ? (
            <Stack spacing={1}>
              {tokens.map((token) => (
                <Stack
                  key={token.id}
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Stack>
                    <Typography variant="body2">{token.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {token.isActive ? "Activo" : "Revocado"}
                    </Typography>
                  </Stack>
                  {token.isActive ? (
                    <Button size="small" color="error" onClick={() => handleRevoke(token.id)}>
                      Revocar
                    </Button>
                  ) : null}
                </Stack>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Todavia no generaste ningun token.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
