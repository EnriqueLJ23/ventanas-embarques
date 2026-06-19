import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/clients";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { toast } from "sonner";
import type { Tier } from "@prisma/client";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const clients = await prisma.client.findMany({
    include: { tier: true },
    orderBy: { name: "asc" },
  });
  return { clients };
}

export default function ClientsAdmin({ loaderData }: Route.ComponentProps) {
  const { clients } = loaderData;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [name, setName] = useState("");
  const [tierId, setTierId] = useState("");
  const [avgLoadTime, setAvgLoadTime] = useState("");

  useEffect(() => {
    if (open) {
      fetch("/api/tiers")
        .then((r) => r.json())
        .then(setTiers);
    }
  }, [open]);

  async function handleCreate() {
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tierId, avgLoadTime }),
    });
    if (!res.ok) {
      toast.error("No se pudo crear el cliente");
      return;
    }
    toast.success("Cliente creado");
    setOpen(false);
    setName("");
    setTierId("");
    setAvgLoadTime("");
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Clientes</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Nuevo cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Tier</Label>
                <Select value={tierId} onValueChange={setTierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="avgLoadTime">Tiempo promedio (minutos)</Label>
                <Input
                  id="avgLoadTime"
                  type="number"
                  value={avgLoadTime}
                  onChange={(e) => setAvgLoadTime(e.target.value)}
                />
              </div>
              <Button onClick={handleCreate} disabled={!name || !tierId || !avgLoadTime}>
                Guardar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Tiempo promedio</TableHead>
            <TableHead>Activo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.name}</TableCell>
              <TableCell>{c.tier.name}</TableCell>
              <TableCell>{c.avgLoadTime} min</TableCell>
              <TableCell>{c.active ? "Sí" : "No"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
