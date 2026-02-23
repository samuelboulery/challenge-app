export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Challenge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lance des défis à tes amis
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
