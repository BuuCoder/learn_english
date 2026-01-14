"""Add security fields to users table

Revision ID: 006_add_security_fields
Revises: 005_add_soft_delete
Create Date: 2026-01-14

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006_add_security_fields'
down_revision = '005_add_soft_delete'
branch_labels = None
depends_on = None


def upgrade():
    # Add security fields to users table
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('failed_login_attempts', sa.Integer(), nullable=True, default=0))
        batch_op.add_column(sa.Column('locked_until', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('last_login_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('last_login_ip', sa.String(length=45), nullable=True))
        batch_op.add_column(sa.Column('password_changed_at', sa.DateTime(), nullable=True))
        
        # Add indexes for better query performance
        batch_op.create_index('ix_users_username', ['username'], unique=True)
        batch_op.create_index('ix_users_email', ['email'], unique=True)
    
    # Set default values for existing rows
    op.execute("UPDATE users SET failed_login_attempts = 0 WHERE failed_login_attempts IS NULL")
    op.execute("UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL")


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index('ix_users_email')
        batch_op.drop_index('ix_users_username')
        batch_op.drop_column('password_changed_at')
        batch_op.drop_column('last_login_ip')
        batch_op.drop_column('last_login_at')
        batch_op.drop_column('locked_until')
        batch_op.drop_column('failed_login_attempts')
