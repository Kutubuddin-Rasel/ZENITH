"use client";
import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Input from "../../../components/Input";
import Button from "../../../components/Button";
import FormError from "../../../components/FormError";
import { useAuth } from "../../../context/AuthContext";
import Link from "next/link";
import Image from "next/image";

const schema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: registerUser, loading } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await registerUser(data.email, data.password, data.name);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError("root", { message: e.message });
      } else {
        setError("root", { message: "Registration failed. Please try again." });
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-indigo-500 via-blue-400 to-purple-400 dark:from-gray-900 dark:via-indigo-900 dark:to-purple-900 relative">
      <header className="w-full flex justify-between items-center px-8 py-6 z-10 relative">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/file.svg" alt="Zenith PM Logo" width={48} height={48} />
          <span className="text-3xl font-extrabold tracking-tight text-white drop-shadow-lg">Zenith PM</span>
        </Link>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white/90 dark:bg-gray-900/80 shadow-2xl rounded-2xl p-8 md:p-12 w-full max-w-md"
        >
          <h1 className="text-3xl font-bold mb-2 text-center text-indigo-700 dark:text-indigo-300">Create your account</h1>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-8">Join Zenith PM and start managing your projects</p>

          <div className="flex flex-col gap-4">
            <Input
              label="Name"
              type="text"
              autoComplete="name"
              {...register("name")}
              error={errors.name?.message}
              className="bg-gray-100 dark:bg-gray-800"
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              {...register("email")}
              error={errors.email?.message}
              className="bg-gray-100 dark:bg-gray-800"
            />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
              error={errors.password?.message}
              className="bg-gray-100 dark:bg-gray-800"
            />
          </div>
          <FormError error={errors.root?.message} />
          <Button type="submit" loading={loading} fullWidth className="mt-6 py-3 text-lg font-bold bg-indigo-600 hover:bg-indigo-700">
            Sign Up
          </Button>
          <div className="mt-6 text-center text-sm">
             <span className="text-gray-600 dark:text-gray-400">Already have an account?</span>{' '}
            <Link href="/auth/login" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
              Sign in
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
} 