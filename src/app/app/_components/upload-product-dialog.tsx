"use client";

import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

/**
 * Upload a new catalog product. The image (optional) is sent directly to
 * Supabase Storage via a signed URL — the service-role key never touches the
 * browser — then the product row is created with that private image path.
 */

const schema = z.object({
  title: z.string().min(1, "A product title is required.").max(300),
  sku: z.string().max(120),
  productType: z.string().max(120),
  price: z.number({ error: "Enter a price." }).nonnegative("Price cannot be negative."),
  inventoryQuantity: z
    .number({ error: "Enter a stock quantity." })
    .int("Stock must be a whole number.")
    .nonnegative("Stock cannot be negative."),
  description: z.string().max(5000),
});

type FormValues = z.infer<typeof schema>;

interface SignedUpload {
  path: string;
  signedUrl: string;
  token: string;
}

interface CreatedProduct {
  product: { id: string };
}

export function UploadProductDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      sku: "",
      productType: "",
      price: 0,
      inventoryQuantity: 0,
      description: "",
    },
  });

  function handleClose() {
    if (submitting) return;
    reset();
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }

  async function uploadImage(image: File): Promise<string> {
    const signed = await apiRequest<SignedUpload>("/api/uploads/sign", {
      method: "POST",
      body: {
        filename: image.name,
        contentType: image.type || "application/octet-stream",
        sizeBytes: image.size,
      },
    });
    const putResponse = await fetch(signed.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": image.type || "application/octet-stream" },
      body: image,
    });
    if (!putResponse.ok) {
      throw new Error(
        "The image could not be uploaded to storage. Please try again.",
      );
    }
    return signed.path;
  }

  const onSubmit = handleSubmit(async (values) => {
    if (submitting) return;
    if (file && !file.type.startsWith("image/")) {
      toast.error("Choose a JPEG, PNG, GIF, or WebP image.");
      return;
    }
    setSubmitting(true);
    try {
      let imagePath: string | null = null;
      if (file) {
        imagePath = await uploadImage(file);
      }
      await apiRequest<CreatedProduct>("/api/products", {
        method: "POST",
        body: {
          title: values.title,
          sku: values.sku,
          productType: values.productType,
          price: values.price,
          inventoryQuantity: values.inventoryQuantity,
          description: values.description,
          imagePath,
        },
      });
      toast.success(`Added "${values.title}" to your catalog.`);
      reset();
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onCreated();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Upload a product"
      description="Add a garment to your catalog. You can analyse it after it's created."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit()} loading={submitting}>
            Add product
          </Button>
        </>
      }
    >
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="up-title" required>
            Title
          </Label>
          <Input
            id="up-title"
            invalid={Boolean(errors.title)}
            {...register("title")}
          />
          {errors.title ? (
            <p className="text-xs text-danger">{errors.title.message}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="up-sku">SKU</Label>
            <Input id="up-sku" {...register("sku")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="up-type">Product type</Label>
            <Input
              id="up-type"
              placeholder="e.g. Shirt"
              {...register("productType")}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="up-price">Price</Label>
            <Input
              id="up-price"
              type="number"
              min={0}
              step="0.01"
              invalid={Boolean(errors.price)}
              {...register("price", { valueAsNumber: true })}
            />
            {errors.price ? (
              <p className="text-xs text-danger">{errors.price.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="up-stock">Stock</Label>
            <Input
              id="up-stock"
              type="number"
              min={0}
              step="1"
              invalid={Boolean(errors.inventoryQuantity)}
              {...register("inventoryQuantity", { valueAsNumber: true })}
            />
            {errors.inventoryQuantity ? (
              <p className="text-xs text-danger">
                {errors.inventoryQuantity.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="up-desc">Description</Label>
          <Textarea id="up-desc" rows={3} {...register("description")} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fileInputId}>Image (optional)</Label>
          <input
            id={fileInputId}
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted file:mr-3 file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-ink"
          />
          <p className="text-xs text-muted">
            JPEG, PNG, GIF, or WebP. Stored privately in your catalog bucket.
          </p>
        </div>
      </form>
    </Dialog>
  );
}
