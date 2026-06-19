import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/tiers";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const tiers = await prisma.tier.findMany({ orderBy: { priority: "asc" } });
  return { tiers };
}

export default function TiersAdmin({ loaderData }: Route.ComponentProps) {
  const { tiers } = loaderData;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("");
  const [description, setDescription] = useState("");

  async function handleCreate() {
    const res = await fetch("/api/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, priority: Number(priority), description }),
    });
    if (!res.ok) {
      toast.error("No se pudo crear el tier");
      return;
    }
    toast.success("Tier creado");
    setOpen(false);
    setName("");
    setPriority("");
    setDescription("");
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Tiers</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Nuevo tier</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo tier</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="priority">Prioridad (1 = mayor)</Label>
                <Input
                  id="priority"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Descripción</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <Button onClick={handleCreate} disabled={!name || !priority}>
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
            <TableHead>Prioridad</TableHead>
            <TableHead>Descripción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiers.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.name}</TableCell>
              <TableCell>{t.priority}</TableCell>
              <TableCell>{t.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
