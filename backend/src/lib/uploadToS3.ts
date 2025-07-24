import { randomUUID }            from "crypto";
import { Upload }                from "@aws-sdk/lib-storage";
import type { MultipartFile }    from "@fastify/multipart";
import { s3Client }              from "../s3";   // adjust the relative path if needed

/**
 * Streams one multipart‐file part to S3 and returns the public URL.
 * @param part   the file part Fastify gives you inside `for await (const part of req.parts())`
 * @param prefix folder/prefix in the bucket – default “tasks”
 */
export async function uploadToS3(
  part: MultipartFile,
  prefix = "tasks"
): Promise<string> {
  const key = `${prefix}/${randomUUID()}_${part.filename}`;

  await new Upload({
    client: s3Client,
    params: {
      Bucket: process.env.AWS_BUCKET!,
      Key:    key,
      Body:   part.file,
      ContentType: part.mimetype ?? "application/octet-stream",
      ACL: "public-read",
    },
  }).done();

  return `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}
