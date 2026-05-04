import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">{t("notFound.heading")}</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {t("notFound.body")}
          </p>
          <Link href="/" className="inline-flex items-center mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
            {t("notFound.backHome")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
