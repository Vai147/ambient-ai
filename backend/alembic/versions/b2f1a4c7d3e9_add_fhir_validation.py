"""add fhir_validation column to soap_notes

Revision ID: b2f1a4c7d3e9
Revises: e15c8a28a437
Create Date: 2026-06-27 22:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2f1a4c7d3e9'
down_revision = 'e15c8a28a437'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('soap_notes', sa.Column('fhir_validation', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('soap_notes', 'fhir_validation')