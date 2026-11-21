import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CourseSelectionItem, ExamConflict } from '../../shared/types';
import type { CoursePalette } from '../WeeklyGrid';

interface ExamDetailsTableProps {
  items: CourseSelectionItem[];
  examConflicts: ExamConflict[];
  showExamConflictAlert: boolean;
  subtitle: string;
  courseColorMap: Map<string, CoursePalette>;
}

export function ExamDetailsTable({
  items,
  examConflicts,
  showExamConflictAlert,
  subtitle,
  courseColorMap,
}: ExamDetailsTableProps) {
  if (items.length === 0) return null;

  return (
    <Card className="print-break-inside-avoid gap-2 py-3.5 shadow-xs print:shadow-none">
      <CardHeader className="px-4 py-0">
        <CardTitle className="text-sm font-bold text-espol-navy">
          Detalle de paralelos y exámenes {subtitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-1">
        {showExamConflictAlert && examConflicts.length > 0 && (
          <Alert variant="destructive" className="mb-3 border-red-300 bg-red-50 text-red-900">
            <AlertTriangle className="size-4" />
            <AlertTitle>Choques de examen detectados</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc pl-4 text-xs">
                {examConflicts.map((c, idx) => (
                  <li key={idx}>
                    {c.examType} ({c.date}): {c.courseA} [{c.timeA}] vs {c.courseB} [{c.timeB}]
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="overflow-hidden rounded-md border border-border print:overflow-visible">
          <Table className="text-xs">
            <TableHeader className="bg-espol-navy [&_th]:h-9 [&_th]:text-white">
              <TableRow className="border-none hover:bg-espol-navy">
                <TableHead>Materia</TableHead>
                <TableHead>Paralelo</TableHead>
                <TableHead>Profesor</TableHead>
                <TableHead>Cupo</TableHead>
                <TableHead>Parcial</TableHead>
                <TableHead>Final</TableHead>
                <TableHead>Mejoramiento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => {
                const examByType = (t: 'Parcial' | 'Final' | 'Mejoramiento') =>
                  item.parallel.exams.find((e) => e.type === t)?.raw ?? '—';
                const color = courseColorMap.get(item.course.code);
                return (
                  <TableRow
                    key={item.course.code}
                    className={idx % 2 === 1 ? 'bg-secondary/60' : 'bg-card'}
                  >
                    <TableCell className="whitespace-normal">
                      <span
                        className="mr-1.5 inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: color?.border ?? '#001c43' }}
                      />
                      <strong className="text-espol-navy">{item.course.code}</strong> ·{' '}
                      {item.course.name}
                    </TableCell>
                    <TableCell className="font-medium">
                      P{item.parallel.parallelNumber}
                      {item.practical ? ` + Prác. ${item.practical.code}` : ''}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {item.parallel.professor || '—'}
                    </TableCell>
                    <TableCell>
                      {item.parallel.available}/{item.parallel.capacity}
                      {item.practical
                        ? ` (Prác: ${item.practical.available}/${item.practical.capacity})`
                        : ''}
                    </TableCell>
                    <TableCell>{examByType('Parcial')}</TableCell>
                    <TableCell>{examByType('Final')}</TableCell>
                    <TableCell>{examByType('Mejoramiento')}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
